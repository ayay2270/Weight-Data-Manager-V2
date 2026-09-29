import * as XLSX from 'xlsx'
import type { AppData, WeightRecord } from '../data/types'
import { getWeightKg } from './helpers'
import { LEVEL_SHEETS } from './weightWorkbookSchema'

function recordsForExport(data: AppData, subset?: WeightRecord[]): WeightRecord[] {
  return subset ?? data.records
}

/** Excel export by level sheets — same sheet names as Import Template. Export may include workflow columns Import does not accept. */
export function exportWorkbook(data: AppData, subset?: WeightRecord[]): ArrayBuffer {
  const source = recordsForExport(data, subset)
  const wb = XLSX.utils.book_new()
  for (const { level, sheetName } of LEVEL_SHEETS) {
    const rows = source
      .filter((r) => r.level === level)
      .map((r) => ({
        Project: r.projectCode,
        'Build / Phase': r.buildPhase || '',
        Description: r.description,
        'Lenovo PN': r.lenovoPn || '',
        'MSFT PN': r.customerPn || '',
        Manufacturer: r.manufacturer || '',
        'Part Category': r.category || '',
        Weight: r.weightValue ?? '',
        Unit: r.weightUnit || '',
        'Weight (kg)': getWeightKg(r) ?? r.originalWeightText ?? '',
        'Configuration / Included Items': r.configuration || '',
        Source: r.source,
        'Supplier / Data Provider': r.supplier || '',
        'Reference / Document Rev.': r.reference || '',
        'Measured By': r.measuredBy || '',
        'Measured Date': r.measuredDate || '',
        Note: r.note || '',
        Status: r.status,
        'Reviewed By': r.reviewedBy || '',
        'Reviewed Date': r.reviewedDate || '',
      }))
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}

export function exportCsv(data: AppData, subset?: WeightRecord[]): string {
  const source = recordsForExport(data, subset)
  const header = [
    'Level',
    'Project',
    'Build / Phase',
    'Description',
    'Lenovo PN',
    'MSFT PN',
    'Manufacturer',
    'Category',
    'Weight',
    'Unit',
    'Weight (kg)',
    'Configuration / Included Items',
    'Supplier / Data Provider',
    'Reference / Document Rev.',
    'Measured By',
    'Measured Date',
    'Source',
    'Status',
    'Reviewed By',
    'Reviewed Date',
    'Note',
  ]
  const lines = [header.join(',')]
  for (const r of source) {
    const cols = [
      r.level,
      r.projectCode,
      r.buildPhase || '',
      r.description,
      r.lenovoPn || '',
      r.customerPn || '',
      r.manufacturer || '',
      r.category || '',
      r.weightValue ?? '',
      r.weightUnit || '',
      getWeightKg(r) ?? '',
      r.configuration || '',
      r.supplier || '',
      r.reference || '',
      r.measuredBy || '',
      r.measuredDate || '',
      r.source,
      r.status,
      r.reviewedBy || '',
      r.reviewedDate || '',
      r.note || '',
    ].map((v) => {
      const s = String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    })
    lines.push(cols.join(','))
  }
  return lines.join('\n')
}

const VIEW_COLUMNS: Record<string, { header: string; value: (record: WeightRecord) => string | number }> = {
  project: { header: 'Project', value: (r) => r.projectCode || '' },
  description: { header: 'Description', value: (r) => r.description || '' },
  lenovoPn: { header: 'Lenovo PN', value: (r) => r.lenovoPn || '' },
  customerPn: { header: 'MSFT PN', value: (r) => r.customerPn || '' },
  manufacturer: { header: 'Manufacturer', value: (r) => r.manufacturer || '' },
  category: { header: 'Part Category', value: (r) => r.category || '' },
  buildPhase: { header: 'Build / Phase', value: (r) => r.buildPhase || '' },
  level: { header: 'Level', value: (r) => r.level },
  weight: { header: 'Weight (kg)', value: (r) => getWeightKg(r) ?? '' },
  measuredDate: { header: 'Measured Date', value: (r) => r.measuredDate || '' },
  note: { header: 'Note', value: (r) => r.note || '' },
  source: { header: 'Source', value: (r) => r.source || '' },
  measuredBy: { header: 'Measured By', value: (r) => r.measuredBy || '' },
  status: { header: 'Status', value: (r) => r.status },
  reviewedBy: { header: 'Reviewed By', value: (r) => r.reviewedBy || '' },
  reviewComment: { header: 'Review Comment', value: (r) => r.reviewComment || '' },
  updated: { header: 'Updated', value: (r) => (r.updatedAt || '').slice(0, 10) },
}

function viewColumns(columns: string[]) {
  const picked = columns.map((key) => VIEW_COLUMNS[key]).filter(Boolean)
  return picked.length ? picked : [VIEW_COLUMNS.project, VIEW_COLUMNS.description, VIEW_COLUMNS.weight, VIEW_COLUMNS.status]
}

function csvCell(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Flat export that keeps the Weight Data row order and visible columns. */
export function exportViewCsv(records: WeightRecord[], columns: string[]): string {
  const cols = viewColumns(columns)
  const lines = [cols.map((col) => csvCell(col.header)).join(',')]
  for (const record of records) {
    lines.push(cols.map((col) => csvCell(col.value(record))).join(','))
  }
  return lines.join('\n')
}

export function exportViewWorkbook(records: WeightRecord[], columns: string[]): ArrayBuffer {
  const cols = viewColumns(columns)
  const rows = records.map((record) => {
    const row: Record<string, string | number> = {}
    for (const col of cols) row[col.header] = col.value(record)
    return row
  })
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [Object.fromEntries(cols.map((col) => [col.header, '']))])
  if (!rows.length) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    range.e.r = 0
    ws['!ref'] = XLSX.utils.encode_range(range)
  }
  XLSX.utils.book_append_sheet(wb, ws, 'Weight Data')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
}
