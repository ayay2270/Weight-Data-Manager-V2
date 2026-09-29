import * as XLSX from 'xlsx'
import type { DataSource, Level, Project, WeightRecord, WeightUnit } from '../data/types'
import { DATA_SOURCES } from '../data/types'
import { findPossibleDuplicate } from './duplicates'
import { nowIso, toWeightKg, uid } from './helpers'
import {
  recommendedConfigWarnings,
  validateBasicMeasurement,
  validateSubmitMeasurement,
  type FieldIssue,
} from './recordValidation'
import {
  IMPORT_COLUMN_WIDTHS,
  IMPORT_COLUMNS,
  IMPORT_EMPHASIS_COLUMNS,
  INSTRUCTIONS_SHEET,
  LEVEL_SHEETS,
  levelFromSheetName,
  type ImportColumn,
} from './weightWorkbookSchema'

export type ImportMode = 'draft' | 'submit'

export type ImportRowIssue = FieldIssue & {
  sheet: string
  row: number
}

export type ParsedImportRow = {
  sheet: string
  row: number
  level: Level
  projectCode: string
  buildPhase: string
  description: string
  lenovoPn: string
  customerPn: string
  manufacturer: string
  category: string
  weightRaw: string
  unitRaw: string
  configuration: string
  sourceRaw: string
  supplier: string
  reference: string
  measuredBy: string
  measuredDate: string
  note: string
}

export type PreparedImportRow = {
  parsed: ParsedImportRow
  project: Project | null
  weightValue: number | null
  weightUnit: WeightUnit
  source: DataSource
  issues: ImportRowIssue[]
  duplicateOf: WeightRecord | null
  skipDuplicate: boolean
  record: WeightRecord | null
}

export type ImportParseResult = {
  sheetsFound: string[]
  rows: PreparedImportRow[]
  readyCount: number
  warningCount: number
  errorCount: number
  duplicateCount: number
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel date serial → YYYY-MM-DD when it looks like a date cell handled elsewhere
    return String(value)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(value).trim()
}

function normalizeHeader(value: unknown): string {
  return cellText(value).replace(/\s+/g, ' ').trim()
}

function parseWeight(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(String(raw).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : Number.NaN
}

function parseUnit(raw: string): WeightUnit | null {
  const u = raw.trim().toLowerCase()
  if (u === 'g' || u === 'kg') return u
  return null
}

function parseSource(raw: string): DataSource | null {
  const text = raw.trim()
  return DATA_SOURCES.includes(text as DataSource) ? (text as DataSource) : null
}

function isValidDate(raw: string): boolean {
  if (!raw) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const d = new Date(`${raw}T00:00:00`)
  return !Number.isNaN(d.getTime())
}

function exampleRows(level: Level): Record<ImportColumn, string>[] {
  if (level === 'Part') {
    return [
      {
        Project: 'S219B',
        'Build / Phase': 'DV',
        Description: 'Example motherboard',
        'Lenovo PN': 'EXAMPLE-PN-001',
        'MSFT PN': '',
        Manufacturer: 'Example Mfr',
        'Part Category': 'PCB',
        Weight: '1180',
        Unit: 'g',
        'Configuration / Included Items': 'Bare motherboard',
        Source: 'Internal Measurement',
        'Supplier / Data Provider': '',
        'Reference / Document Rev.': '',
        'Measured By': 'Amy',
        'Measured Date': '2026-09-22',
        Note: 'Example Part row — replace with real data',
      },
    ]
  }
  if (level === 'Node') {
    return [
      {
        Project: 'S219B',
        'Build / Phase': 'DV',
        Description: 'Example compute node',
        'Lenovo PN': '',
        'MSFT PN': '',
        Manufacturer: '',
        'Part Category': '',
        Weight: '12.5',
        Unit: 'kg',
        'Configuration / Included Items': 'Node + HSK + PSU',
        Source: 'Internal Measurement',
        'Supplier / Data Provider': '',
        'Reference / Document Rev.': '',
        'Measured By': 'Amy',
        'Measured Date': '2026-09-22',
        Note: 'Example Node row',
      },
    ]
  }
  if (level === 'Rack') {
    return [
      {
        Project: 'S219B',
        'Build / Phase': 'DV',
        Description: 'Example full rack',
        'Lenovo PN': '',
        'MSFT PN': '',
        Manufacturer: '',
        'Part Category': '',
        Weight: '480',
        Unit: 'kg',
        'Configuration / Included Items': 'Full rack + 8 GPU + HSK + PSU + cable, without pallet',
        Source: 'Internal Measurement',
        'Supplier / Data Provider': '',
        'Reference / Document Rev.': '',
        'Measured By': 'Amy',
        'Measured Date': '2026-09-22',
        Note: 'Example Rack row — Configuration required',
      },
    ]
  }
  return [
    {
      Project: 'S2195',
      'Build / Phase': 'Packaging',
      Description: 'Example sleeve package',
      'Lenovo PN': '',
      'MSFT PN': '',
      Manufacturer: '',
      'Part Category': 'Packaging',
      Weight: '4.83',
      Unit: 'kg',
      'Configuration / Included Items': 'Sleeve + foam',
      Source: 'Supplier',
      'Supplier / Data Provider': 'Bromake',
      'Reference / Document Rev.': 'PKG Weight List Rev.B',
      'Measured By': 'Amy',
      'Measured Date': '2026-09-22',
      Note: 'Example Package row',
    },
  ]
}

function applySheetStyle(ws: XLSX.WorkSheet, hasExamples: boolean) {
  const cols = IMPORT_COLUMNS.map((header) => ({ wch: IMPORT_COLUMN_WIDTHS[header] }))
  ws['!cols'] = cols
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: hasExamples ? 1 : 0, c: IMPORT_COLUMNS.length - 1 },
    }),
  }
  // Best-effort freeze (community SheetJS may ignore unknown props)
  ;(ws as XLSX.WorkSheet & { '!freeze'?: unknown })['!freeze'] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: 'A2',
    activePane: 'bottomLeft',
    state: 'frozen',
  }
  for (let c = 0; c < IMPORT_COLUMNS.length; c += 1) {
    const header = IMPORT_COLUMNS[c]
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    const cell = ws[addr] as XLSX.CellObject | undefined
    if (!cell) continue
    const emphasize = IMPORT_EMPHASIS_COLUMNS.includes(header)
    ;(cell as XLSX.CellObject & { s?: unknown }).s = {
      font: { bold: true },
      fill: emphasize ? { fgColor: { rgb: 'FFF3E8' } } : { fgColor: { rgb: 'F1F5F9' } },
      alignment: { wrapText: true, vertical: 'center' },
    }
  }
}

function instructionsSheet(): XLSX.WorkSheet {
  const lines = [
    ['Weight Data Import Template'],
    [''],
    ['How to use'],
    ['1. Keep the sheet names exactly as provided: Part Level / Node Level / Rack Level / Package.'],
    ['2. Level is determined by the sheet name. Do not add a Level column.'],
    ['3. Project must match an existing Project code in Weight Data Manager (e.g. S219B).'],
    ['4. Delete example rows before importing production data.'],
    ['5. Upload the file on Import / Export and choose Import as Draft or Import & Submit for Review.'],
    [''],
    ['Required / recommended rules'],
    ['Rack: Configuration / Included Items is required.'],
    ['Node: Configuration / Included Items is recommended.'],
    ['Package: Configuration / Included Items is recommended.'],
    ['Part: Configuration / Included Items is optional.'],
    ['Source = Supplier → Supplier / Data Provider is required for Submit for Review.'],
    ['Import & Submit for Review also requires Weight > 0, Measured By, and Measured Date.'],
    ['Description is always required for Import.'],
    [''],
    ['Allowed Source values'],
    ...DATA_SOURCES.map((source) => [source]),
    [''],
    ['Allowed Unit values'],
    ['g'],
    ['kg'],
    [''],
    ['Measured Date format'],
    ['YYYY-MM-DD'],
    [''],
    ['Notes'],
    ['Do not fill Status / Reviewed By / Reviewed Date / Review Comment — those are managed in the app.'],
    ['Import never overwrites existing records. Possible duplicates are skipped by default.'],
  ]
  const ws = XLSX.utils.aoa_to_sheet(lines)
  ws['!cols'] = [{ wch: 100 }]
  return ws
}

/** Generate the official import workbook (Instructions + 4 level sheets). */
export function buildImportTemplateWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, instructionsSheet(), INSTRUCTIONS_SHEET)

  for (const entry of LEVEL_SHEETS) {
    const examples = exampleRows(entry.level)
    const rows = examples.map((example) => {
      const row: Record<string, string> = {}
      for (const col of IMPORT_COLUMNS) row[col] = example[col]
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows, { header: [...IMPORT_COLUMNS] })
    applySheetStyle(ws, true)
    XLSX.utils.book_append_sheet(wb, ws, entry.sheetName)
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true }) as ArrayBuffer
}

function mapSheetRows(sheetName: string, ws: XLSX.WorkSheet): ParsedImportRow[] {
  const level = levelFromSheetName(sheetName)
  if (!level) return []
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(ws, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][]
  if (!matrix.length) return []

  const headers = (matrix[0] || []).map((h) => normalizeHeader(h))
  const indexOf = (name: ImportColumn) => headers.findIndex((h) => h === name)

  const rows: ParsedImportRow[] = []
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || []
    const get = (name: ImportColumn) => cellText(line[indexOf(name)])
    const projectCode = get('Project')
    const description = get('Description')
    const weightRaw = get('Weight')
    const unitRaw = get('Unit')
    const sourceRaw = get('Source')
    const measuredBy = get('Measured By')
    const measuredDate = get('Measured Date')
    const configuration = get('Configuration / Included Items')
    const supplier = get('Supplier / Data Provider')
    const note = get('Note')
    const empty =
      !projectCode &&
      !description &&
      !weightRaw &&
      !unitRaw &&
      !sourceRaw &&
      !measuredBy &&
      !measuredDate &&
      !configuration &&
      !supplier &&
      !note
    if (empty) continue

    rows.push({
      sheet: sheetName,
      row: r + 1,
      level,
      projectCode,
      buildPhase: get('Build / Phase'),
      description,
      lenovoPn: get('Lenovo PN'),
      customerPn: get('MSFT PN'),
      manufacturer: get('Manufacturer'),
      category: get('Part Category'),
      weightRaw,
      unitRaw,
      configuration,
      sourceRaw,
      supplier,
      reference: get('Reference / Document Rev.'),
      measuredBy,
      measuredDate,
      note,
    })
  }
  return rows
}

function issue(
  parsed: ParsedImportRow,
  field: string,
  message: string,
  severity: 'error' | 'warning',
): ImportRowIssue {
  return { sheet: parsed.sheet, row: parsed.row, field, message, severity }
}

export function parseImportWorkbook(
  buffer: ArrayBuffer,
  projects: Project[],
  existingRecords: WeightRecord[],
  mode: ImportMode,
  options?: { importDuplicates?: Set<string> },
): ImportParseResult {
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    return {
      sheetsFound: [],
      rows: [],
      readyCount: 0,
      warningCount: 0,
      errorCount: 1,
      duplicateCount: 0,
    }
  }

  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetsFound = wb.SheetNames.filter((name) => name !== INSTRUCTIONS_SHEET)
  const projectByCode = new Map(projects.map((p) => [p.code.trim().toLowerCase(), p]))
  const importDuplicates = options?.importDuplicates ?? new Set<string>()

  const prepared: PreparedImportRow[] = []
  const stagedRecords: WeightRecord[] = []

  for (const sheetName of wb.SheetNames) {
    if (sheetName === INSTRUCTIONS_SHEET) continue
    const level = levelFromSheetName(sheetName)
    if (!level) {
      prepared.push({
        parsed: {
          sheet: sheetName,
          row: 1,
          level: 'Part',
          projectCode: '',
          buildPhase: '',
          description: '',
          lenovoPn: '',
          customerPn: '',
          manufacturer: '',
          category: '',
          weightRaw: '',
          unitRaw: '',
          configuration: '',
          sourceRaw: '',
          supplier: '',
          reference: '',
          measuredBy: '',
          measuredDate: '',
          note: '',
        },
        project: null,
        weightValue: null,
        weightUnit: 'kg',
        source: 'Unknown',
        issues: [
          {
            sheet: sheetName,
            row: 1,
            field: 'Sheet',
            message: `Invalid sheet name "${sheetName}". Use Part Level / Node Level / Rack Level / Package.`,
            severity: 'error',
          },
        ],
        duplicateOf: null,
        skipDuplicate: true,
        record: null,
      })
      continue
    }

    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const parsedRows = mapSheetRows(sheetName, ws)

    for (const parsed of parsedRows) {
      const issues: ImportRowIssue[] = []
      const project = parsed.projectCode
        ? projectByCode.get(parsed.projectCode.trim().toLowerCase()) || null
        : null
      if (!parsed.projectCode.trim()) {
        issues.push(issue(parsed, 'Project', 'Project is required.', 'error'))
      } else if (!project) {
        issues.push(issue(parsed, 'Project', `Project not found: ${parsed.projectCode}`, 'error'))
      }

      const unit = parseUnit(parsed.unitRaw)
      const weightValue = parseWeight(parsed.weightRaw)
      if (parsed.weightRaw.trim() && Number.isNaN(weightValue as number)) {
        issues.push(issue(parsed, 'Weight', 'Weight must be numeric.', 'error'))
      }
      if (parsed.unitRaw.trim() && !unit) {
        issues.push(issue(parsed, 'Unit', 'Unit must be g or kg.', 'error'))
      }
      if (parsed.weightRaw.trim() && !parsed.unitRaw.trim()) {
        issues.push(issue(parsed, 'Unit', 'Unit is required when Weight is provided.', 'error'))
      }

      const source = parseSource(parsed.sourceRaw) || (parsed.sourceRaw.trim() ? null : 'Unknown')
      if (parsed.sourceRaw.trim() && !source) {
        issues.push(
          issue(parsed, 'Source', `Invalid Source. Allowed: ${DATA_SOURCES.join(', ')}.`, 'error'),
        )
      }
      if (parsed.measuredDate && !isValidDate(parsed.measuredDate)) {
        issues.push(issue(parsed, 'Measured Date', 'Measured Date must use YYYY-MM-DD.', 'error'))
      }

      const weightUnit: WeightUnit = unit || 'kg'
      const numericWeight =
        weightValue != null && !Number.isNaN(weightValue) ? weightValue : null
      const measurement = {
        level: parsed.level,
        description: parsed.description,
        weightValue: numericWeight,
        weightUnit,
        configuration: parsed.configuration,
        source: (source || 'Unknown') as DataSource,
        supplier: parsed.supplier,
        measuredBy: parsed.measuredBy,
        measuredDate: parsed.measuredDate,
      }

      for (const item of validateBasicMeasurement(measurement)) {
        issues.push(issue(parsed, item.field, item.message, item.severity))
      }
      for (const item of recommendedConfigWarnings(measurement)) {
        issues.push(issue(parsed, item.field, item.message, item.severity))
      }
      if (mode === 'submit') {
        for (const item of validateSubmitMeasurement(measurement)) {
          issues.push(issue(parsed, item.field, item.message, item.severity))
        }
      } else if (measurement.source === 'Supplier' && !measurement.supplier.trim() && measurement.weightValue != null) {
        // Draft: soft warning only
        issues.push(
          issue(
            parsed,
            'Supplier / Data Provider',
            'Supplier / Data Provider is recommended when Source is Supplier.',
            'warning',
          ),
        )
      }

      let duplicateOf: WeightRecord | null = null
      let skipDuplicate = false
      let record: WeightRecord | null = null

      if (project && !issues.some((i) => i.severity === 'error')) {
        const stamp = nowIso()
        const category =
          parsed.category.trim() || (parsed.level === 'Package' ? 'Packaging' : '')
        record = {
          id: uid('rec'),
          projectId: project.id,
          projectCode: project.code,
          level: parsed.level,
          description: parsed.description.trim(),
          lenovoPn: parsed.lenovoPn.trim() || null,
          customerPn: parsed.customerPn.trim() || null,
          manufacturer: parsed.manufacturer.trim() || null,
          category: category || null,
          weightValue: numericWeight,
          weightUnit,
          weight_kg: toWeightKg(numericWeight, weightUnit),
          buildPhase: parsed.buildPhase.trim() || null,
          configuration: parsed.configuration.trim() || null,
          supplier: parsed.supplier.trim() || null,
          reference: parsed.reference.trim() || null,
          measuredBy: parsed.measuredBy.trim() || null,
          measuredDate: parsed.measuredDate.trim() || null,
          source: measurement.source,
          status: mode === 'submit' ? 'Pending Review' : 'Draft',
          reviewedBy: null,
          reviewedDate: null,
          reviewComment: null,
          note: parsed.note.trim() || null,
          originalWeightText: null,
          createdAt: stamp,
          updatedAt: stamp,
        }

        duplicateOf =
          findPossibleDuplicate(
            {
              projectId: record.projectId,
              buildPhase: record.buildPhase,
              level: record.level,
              description: record.description,
              lenovoPn: record.lenovoPn,
              configuration: record.configuration,
            },
            [...existingRecords, ...stagedRecords],
          ) || null

        if (duplicateOf) {
          const key = `${parsed.sheet}:${parsed.row}`
          skipDuplicate = !importDuplicates.has(key)
          issues.push(
            issue(
              parsed,
              'Duplicate',
              `Possible duplicate of existing record (${duplicateOf.description || duplicateOf.id}).`,
              'warning',
            ),
          )
        }

        if (!skipDuplicate) stagedRecords.push(record)
      }

      prepared.push({
        parsed,
        project,
        weightValue: numericWeight,
        weightUnit,
        source: measurement.source,
        issues,
        duplicateOf,
        skipDuplicate,
        record: skipDuplicate ? null : record,
      })
    }
  }

  const errorCount = prepared.reduce(
    (sum, row) => sum + row.issues.filter((i) => i.severity === 'error').length,
    0,
  )
  const warningCount = prepared.reduce(
    (sum, row) => sum + row.issues.filter((i) => i.severity === 'warning').length,
    0,
  )
  const duplicateCount = prepared.filter((row) => row.duplicateOf).length
  const readyCount = prepared.filter(
    (row) => row.record && !row.issues.some((i) => i.severity === 'error') && !row.skipDuplicate,
  ).length

  return {
    sheetsFound,
    rows: prepared,
    readyCount,
    warningCount,
    errorCount,
    duplicateCount,
  }
}

export function collectImportRecords(result: ImportParseResult): WeightRecord[] {
  if (result.errorCount > 0) return []
  return result.rows
    .filter((row) => row.record && !row.skipDuplicate)
    .map((row) => row.record as WeightRecord)
}

export function importRowKey(row: PreparedImportRow): string {
  return `${row.parsed.sheet}:${row.parsed.row}`
}

export const IMPORT_TEMPLATE_FILENAME = 'Weight_Data_Import_Template.xlsx'
export const IMPORT_MAX_BYTES = MAX_IMPORT_BYTES
