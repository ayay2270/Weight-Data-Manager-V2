import * as XLSX from 'xlsx'
import type { Project, WeightRecord } from '../src/data/types'
import {
  buildImportTemplateWorkbook,
  collectImportRecords,
  IMPORT_TEMPLATE_FILENAME,
  importRowKey,
  parseImportWorkbook,
} from '../src/utils/importWeightWorkbook'
import { exportCsv, exportWorkbook } from '../src/utils/io'
import { INSTRUCTIONS_SHEET, IMPORT_COLUMNS, LEVEL_SHEETS } from '../src/utils/weightWorkbookSchema'
import { toWeightKg } from '../src/utils/helpers'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  console.log(`PASS ${label}: ${actual}`)
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) throw new Error(`${label}: expected truthy, received ${actual}`)
  console.log(`PASS ${label}`)
}

const projects: Project[] = [
  {
    id: 'prj_s219b',
    code: 'S219B',
    name: 'S219B Rack Platform',
    phase: 'DV',
    status: 'Active',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'prj_s2195',
    code: 'S2195',
    name: 'S2195 Packaging',
    phase: null,
    status: 'Active',
    createdAt: '',
    updatedAt: '',
  },
]

function blankRow(): Record<string, string> {
  return Object.fromEntries(IMPORT_COLUMNS.map((col) => [col, ''])) as Record<string, string>
}

function buildFilledWorkbook(rowsBySheet: Record<string, Record<string, string>[]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Instructions']]), INSTRUCTIONS_SHEET)
  for (const entry of LEVEL_SHEETS) {
    const rows = rowsBySheet[entry.sheetName] || []
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [blankRow()], { header: [...IMPORT_COLUMNS] })
    if (!rows.length) {
      // keep header only
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
      range.e.r = 0
      ws['!ref'] = XLSX.utils.encode_range(range)
    }
    XLSX.utils.book_append_sheet(wb, ws, entry.sheetName)
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

// —— Template generation ——
const template = buildImportTemplateWorkbook()
const templateWb = XLSX.read(template, { type: 'array' })
assertEqual(templateWb.SheetNames.length, 5, 'template has 5 sheets')
assertEqual(templateWb.SheetNames[0], INSTRUCTIONS_SHEET, 'sheet 1 Instructions')
assertEqual(templateWb.SheetNames[1], 'Part Level', 'sheet 2 Part Level')
assertEqual(templateWb.SheetNames[2], 'Node Level', 'sheet 3 Node Level')
assertEqual(templateWb.SheetNames[3], 'Rack Level', 'sheet 4 Rack Level')
assertEqual(templateWb.SheetNames[4], 'Package', 'sheet 5 Package')
assertEqual(IMPORT_TEMPLATE_FILENAME, 'Weight_Data_Import_Template.xlsx', 'template filename')

for (const entry of LEVEL_SHEETS) {
  const ws = templateWb.Sheets[entry.sheetName]
  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][]
  assertEqual(matrix[0].join('|'), IMPORT_COLUMNS.join('|'), `${entry.sheetName} headers`)
}

// —— Valid four-level import (Draft) ——
const draftRows = {
  'Part Level': [
    {
      ...blankRow(),
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'Import Part MB',
      'Lenovo PN': 'IMP-PART-001',
      Manufacturer: 'Example',
      'Part Category': 'PCB',
      Weight: '500',
      Unit: 'g',
      Source: 'Internal Measurement',
      'Measured By': 'Amy',
      'Measured Date': '2026-09-22',
      Note: 'draft part',
    },
  ],
  'Node Level': [
    {
      ...blankRow(),
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'Import Node',
      Weight: '12.5',
      Unit: 'kg',
      'Configuration / Included Items': 'Node + HSK',
      Source: 'Internal Measurement',
      'Measured By': 'Amy',
      'Measured Date': '2026-09-22',
    },
  ],
  'Rack Level': [
    {
      ...blankRow(),
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'Import Rack',
      Weight: '480',
      Unit: 'kg',
      'Configuration / Included Items': 'Full rack config',
      Source: 'Internal Measurement',
      'Measured By': 'Amy',
      'Measured Date': '2026-09-22',
    },
  ],
  Package: [
    {
      ...blankRow(),
      Project: 'S2195',
      'Build / Phase': 'Packaging',
      Description: 'Import Package',
      Weight: '4.83',
      Unit: 'kg',
      'Configuration / Included Items': 'Sleeve + foam',
      Source: 'Supplier',
      'Supplier / Data Provider': 'Bromake',
      'Measured By': 'Amy',
      'Measured Date': '2026-09-22',
    },
  ],
}

const draftBuffer = buildFilledWorkbook(draftRows)
const draftParsed = parseImportWorkbook(draftBuffer, projects, [], 'draft')
assertEqual(draftParsed.errorCount, 0, 'draft import no critical errors')
assertEqual(draftParsed.readyCount, 4, 'draft import 4 ready rows')
const draftRecords = collectImportRecords(draftParsed)
assertEqual(draftRecords.length, 4, 'draft collect 4 records')
assertEqual(draftRecords.every((r) => r.status === 'Draft'), true, 'draft status Draft')
assertEqual(draftRecords.find((r) => r.level === 'Part')?.weight_kg, toWeightKg(500, 'g'), 'part g→kg')
assertEqual(draftRecords.find((r) => r.level === 'Node')?.weight_kg, 12.5, 'node kg')
assertEqual(draftRecords.find((r) => r.level === 'Part')?.projectId, 'prj_s219b', 'project mapping')
assertEqual(draftRecords.find((r) => r.level === 'Package')?.category, 'Packaging', 'package default category')

// —— Submit mode ——
const submitParsed = parseImportWorkbook(draftBuffer, projects, [], 'submit')
assertEqual(submitParsed.errorCount, 0, 'submit import no critical errors')
const submitRecords = collectImportRecords(submitParsed)
assertEqual(submitRecords.every((r) => r.status === 'Pending Review'), true, 'submit status Pending Review')

// —— Validation: unknown project ——
const badProject = buildFilledWorkbook({
  'Part Level': [{ ...draftRows['Part Level'][0], Project: 'NOPE' }],
})
const unknownProject = parseImportWorkbook(badProject, projects, [], 'draft')
assertTruthy(unknownProject.errorCount > 0, 'unknown project errors')
assertTruthy(
  unknownProject.rows.some((r) => r.issues.some((i) => i.message.includes('Project not found'))),
  'unknown project message',
)
assertEqual(collectImportRecords(unknownProject).length, 0, 'unknown project imports 0')

// —— Invalid unit / source / description ——
const badUnit = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], Unit: 'lb' }],
  }),
  projects,
  [],
  'draft',
)
assertTruthy(badUnit.rows.some((r) => r.issues.some((i) => i.field === 'Unit' && i.severity === 'error')), 'invalid unit')

const badSource = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], Source: 'Guesswork' }],
  }),
  projects,
  [],
  'draft',
)
assertTruthy(badSource.rows.some((r) => r.issues.some((i) => i.field === 'Source' && i.severity === 'error')), 'invalid source')

const missingDesc = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], Description: '' }],
  }),
  projects,
  [],
  'draft',
)
assertTruthy(
  missingDesc.rows.some((r) => r.issues.some((i) => i.field === 'Description' && i.severity === 'error')),
  'missing description',
)

// —— Rack missing config (submit) ——
const rackMissing = parseImportWorkbook(
  buildFilledWorkbook({
    'Rack Level': [{ ...draftRows['Rack Level'][0], 'Configuration / Included Items': '' }],
  }),
  projects,
  [],
  'submit',
)
assertTruthy(
  rackMissing.rows.some((r) =>
    r.issues.some((i) => i.field === 'Configuration / Included Items' && i.severity === 'error'),
  ),
  'rack missing config submit',
)

// —— Supplier missing supplier (submit) ——
const supplierMissing = parseImportWorkbook(
  buildFilledWorkbook({
    Package: [{ ...draftRows.Package[0], 'Supplier / Data Provider': '' }],
  }),
  projects,
  [],
  'submit',
)
assertTruthy(
  supplierMissing.rows.some((r) =>
    r.issues.some((i) => i.field === 'Supplier / Data Provider' && i.severity === 'error'),
  ),
  'supplier missing supplier',
)

// —— Submit missing measuredBy / measuredDate / weight <= 0 ——
const missingBy = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], 'Measured By': '' }],
  }),
  projects,
  [],
  'submit',
)
assertTruthy(missingBy.rows.some((r) => r.issues.some((i) => i.field === 'Measured By')), 'submit missing measuredBy')

const missingDate = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], 'Measured Date': '' }],
  }),
  projects,
  [],
  'submit',
)
assertTruthy(missingDate.rows.some((r) => r.issues.some((i) => i.field === 'Measured Date')), 'submit missing measuredDate')

const zeroWeight = parseImportWorkbook(
  buildFilledWorkbook({
    'Part Level': [{ ...draftRows['Part Level'][0], Weight: '0' }],
  }),
  projects,
  [],
  'submit',
)
assertTruthy(zeroWeight.rows.some((r) => r.issues.some((i) => i.field === 'Weight' && i.severity === 'error')), 'submit weight <= 0')

// —— Duplicates ——
const existing: WeightRecord[] = [
  {
    id: 'rec_existing',
    projectId: 'prj_s219b',
    projectCode: 'S219B',
    level: 'Part',
    description: 'Import Part MB',
    lenovoPn: 'IMP-PART-001',
    customerPn: null,
    manufacturer: null,
    category: null,
    weightValue: 500,
    weightUnit: 'g',
    weight_kg: 0.5,
    buildPhase: 'DV',
    configuration: null,
    supplier: null,
    reference: null,
    measuredBy: 'Amy',
    measuredDate: '2026-09-22',
    source: 'Internal Measurement',
    status: 'Draft',
    reviewedBy: null,
    reviewedDate: null,
    reviewComment: null,
    note: null,
    originalWeightText: null,
    createdAt: '',
    updatedAt: '',
  },
]
const dupParsed = parseImportWorkbook(draftBuffer, projects, existing, 'draft')
assertTruthy(dupParsed.duplicateCount >= 1, 'duplicate detected')
assertEqual(collectImportRecords(dupParsed).length, 3, 'duplicates skipped by default (1 of 4)')
const partDup = dupParsed.rows.find((r) => r.parsed.description === 'Import Part MB')!
assertTruthy(partDup.duplicateOf, 'part row marked duplicate')
assertEqual(partDup.skipDuplicate, true, 'default skip')
const anyway = new Set([importRowKey(partDup)])
const dupAnyway = parseImportWorkbook(draftBuffer, projects, existing, 'draft', { importDuplicates: anyway })
assertEqual(collectImportRecords(dupAnyway).length, 4, 'import anyway includes duplicate')

// —— Export regression ——
const exportData = {
  version: 1 as const,
  projects,
  records: draftRecords,
  settings: { defaultUnit: 'kg' as const },
}
const xlsxBuf = exportWorkbook(exportData)
const exportWb = XLSX.read(xlsxBuf, { type: 'array' })
assertEqual(exportWb.SheetNames.join('|'), LEVEL_SHEETS.map((s) => s.sheetName).join('|'), 'export sheet names')
const csv = exportCsv(exportData)
assertTruthy(csv.includes('Build / Phase'), 'csv export Build / Phase')
assertTruthy(csv.includes('Status'), 'csv export Status')
assertTruthy(csv.includes('Import Part MB'), 'csv includes imported part')

console.log('\nAll import workbook tests passed.')
