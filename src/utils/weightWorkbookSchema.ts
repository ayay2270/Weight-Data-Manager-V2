import type { Level, WeightUnit } from '../data/types'
import { DATA_SOURCES } from '../data/types'

/** Canonical level worksheets used by Import Template and Excel Export. */
export const LEVEL_SHEETS: { level: Level; sheetName: string; aliases: string[]; defaultUnit: WeightUnit }[] = [
  { level: 'Part', sheetName: 'Part Level', aliases: ['Part Level', 'Part'], defaultUnit: 'g' },
  { level: 'Node', sheetName: 'Node Level', aliases: ['Node Level', 'Node'], defaultUnit: 'kg' },
  { level: 'Rack', sheetName: 'Rack Level', aliases: ['Rack Level', 'Rack'], defaultUnit: 'kg' },
  { level: 'Package', sheetName: 'Package', aliases: ['Package'], defaultUnit: 'kg' },
]

export const INSTRUCTIONS_SHEET = 'Instructions'

/** Import template column headers — matches Add Weight Record fields (Level comes from sheet). */
export const IMPORT_COLUMNS = [
  'Project',
  'Build / Phase',
  'Description',
  'Lenovo PN',
  'MSFT PN',
  'Manufacturer',
  'Part Category',
  'Weight',
  'Unit',
  'Configuration / Included Items',
  'Source',
  'Supplier / Data Provider',
  'Reference / Document Rev.',
  'Measured By',
  'Measured Date',
  'Note',
] as const

export type ImportColumn = (typeof IMPORT_COLUMNS)[number]

export const IMPORT_COLUMN_WIDTHS: Record<ImportColumn, number> = {
  Project: 12,
  'Build / Phase': 12,
  Description: 36,
  'Lenovo PN': 16,
  'MSFT PN': 16,
  Manufacturer: 16,
  'Part Category': 16,
  Weight: 10,
  Unit: 8,
  'Configuration / Included Items': 36,
  Source: 20,
  'Supplier / Data Provider': 18,
  'Reference / Document Rev.': 22,
  'Measured By': 14,
  'Measured Date': 14,
  Note: 24,
}

/** Columns that are often required / recommended — used for light header tint in template. */
export const IMPORT_EMPHASIS_COLUMNS: ImportColumn[] = [
  'Project',
  'Description',
  'Weight',
  'Unit',
  'Configuration / Included Items',
  'Source',
  'Supplier / Data Provider',
  'Measured By',
  'Measured Date',
]

export const ALLOWED_UNITS: WeightUnit[] = ['g', 'kg']
export const ALLOWED_SOURCES = [...DATA_SOURCES]

export function sheetNameForLevel(level: Level): string {
  return LEVEL_SHEETS.find((entry) => entry.level === level)?.sheetName || level
}

export function levelFromSheetName(name: string): Level | null {
  const normalized = name.trim().toLowerCase()
  for (const entry of LEVEL_SHEETS) {
    if (entry.aliases.some((alias) => alias.toLowerCase() === normalized)) return entry.level
  }
  return null
}

export function configRequirement(level: Level): 'optional' | 'recommended' | 'required' {
  if (level === 'Rack') return 'required'
  if (level === 'Node' || level === 'Package') return 'recommended'
  return 'optional'
}
