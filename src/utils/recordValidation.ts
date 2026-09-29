import type { DataSource, Level, WeightRecord, WeightUnit } from '../data/types'
import { DATA_SOURCES } from '../data/types'
import { configRequirement } from './weightWorkbookSchema'

export type MeasurementInput = {
  level: Level
  description: string
  weightValue: number | null
  weightUnit: WeightUnit
  configuration: string
  source: DataSource
  supplier: string
  measuredBy: string
  measuredDate: string
}

export type FieldIssue = {
  field: string
  message: string
  severity: 'error' | 'warning'
}

/** Shared rules used by Add Weight Record Submit and Import & Submit for Review. */
export function validateSubmitMeasurement(input: MeasurementInput): FieldIssue[] {
  const issues: FieldIssue[] = []
  if (input.weightValue == null || !(input.weightValue > 0)) {
    issues.push({
      field: 'Weight',
      message: 'Weight must be greater than zero before submitting for review.',
      severity: 'error',
    })
  }
  if (!input.measuredBy.trim()) {
    issues.push({
      field: 'Measured By',
      message: 'Measured By is required before submitting for review.',
      severity: 'error',
    })
  }
  if (!input.measuredDate.trim()) {
    issues.push({
      field: 'Measured Date',
      message: 'Measured Date is required before submitting for review.',
      severity: 'error',
    })
  }
  if (configRequirement(input.level) === 'required' && !input.configuration.trim()) {
    issues.push({
      field: 'Configuration / Included Items',
      message: 'Please specify what is included in this rack.',
      severity: 'error',
    })
  }
  if (input.source === 'Supplier' && !input.supplier.trim()) {
    issues.push({
      field: 'Supplier / Data Provider',
      message: 'Supplier / Data Provider is required before submitting for review when Source is Supplier.',
      severity: 'error',
    })
  }
  return issues
}

export function validateBasicMeasurement(input: MeasurementInput): FieldIssue[] {
  const issues: FieldIssue[] = []
  if (!input.description.trim()) {
    issues.push({ field: 'Description', message: 'Description is required.', severity: 'error' })
  }
  if (input.weightValue != null && !Number.isFinite(input.weightValue)) {
    issues.push({ field: 'Weight', message: 'Weight must be a valid number.', severity: 'error' })
  }
  if (!DATA_SOURCES.includes(input.source)) {
    issues.push({ field: 'Source', message: `Invalid Source. Allowed: ${DATA_SOURCES.join(', ')}.`, severity: 'error' })
  }
  if (input.weightUnit !== 'g' && input.weightUnit !== 'kg') {
    issues.push({ field: 'Unit', message: 'Unit must be g or kg.', severity: 'error' })
  }
  return issues
}

export function recommendedConfigWarnings(input: MeasurementInput): FieldIssue[] {
  if (configRequirement(input.level) !== 'recommended') return []
  if (input.configuration.trim()) return []
  return [
    {
      field: 'Configuration / Included Items',
      message: `Configuration / Included Items is recommended for ${input.level} records.`,
      severity: 'warning',
    },
  ]
}

export function measurementInputFromRecord(
  record: Pick<
    WeightRecord,
    | 'level'
    | 'description'
    | 'weightValue'
    | 'weightUnit'
    | 'configuration'
    | 'source'
    | 'supplier'
    | 'measuredBy'
    | 'measuredDate'
  >,
): MeasurementInput {
  return {
    level: record.level,
    description: record.description || '',
    weightValue: record.weightValue ?? null,
    weightUnit: record.weightUnit,
    configuration: record.configuration || '',
    source: record.source,
    supplier: record.supplier || '',
    measuredBy: record.measuredBy || '',
    measuredDate: record.measuredDate || '',
  }
}
