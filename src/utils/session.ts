import type { DataSource, Level, Project, WeightRecord, WeightUnit } from '../data/types'
import { findPossibleDuplicate } from './duplicates'
import { nowIso, toWeightKg, uid } from './helpers'
import { validateSubmitMeasurement, type FieldIssue } from './recordValidation'

/** Fields set once per measurement session (the same fields the original "Submit & Add Next" retains). */
export interface SessionContext {
  projectId: string
  buildPhase: string
  level: Level
  source: DataSource
  measuredBy: string
  measuredDate: string
}

/** Fields typed for every measured item. */
export interface SessionItem {
  description: string
  lenovoPn: string
  customerPn: string
  manufacturer: string
  category: string
  weightValue: string
  weightUnit: WeightUnit
  configuration: string
  supplier: string
  reference: string
  note: string
}

/** Unit default mirrors the original form: Part → g, other levels → the app's default unit. */
export function defaultUnitFor(level: Level, defaultUnit: WeightUnit): WeightUnit {
  return level === 'Part' ? 'g' : defaultUnit
}

export function blankItem(ctx: SessionContext, defaultUnit: WeightUnit, carry?: Pick<SessionItem, 'weightUnit' | 'supplier'>): SessionItem {
  return {
    description: '',
    lenovoPn: '',
    customerPn: '',
    manufacturer: '',
    category: ctx.level === 'Package' ? 'Packaging' : '',
    weightValue: '',
    weightUnit: ctx.level === 'Part' ? 'g' : carry?.weightUnit && carry.weightUnit !== 'g' ? carry.weightUnit : defaultUnitFor(ctx.level, defaultUnit),
    configuration: '',
    supplier: ctx.source === 'Supplier' ? carry?.supplier || '' : '',
    reference: '',
    note: '',
  }
}

export type SessionBuild =
  | { ok: true; record: WeightRecord; duplicate: WeightRecord | null }
  | { ok: false; issues: FieldIssue[] }

const FIELD_OF_ISSUE: Record<string, keyof SessionItem | keyof SessionContext> = {
  Weight: 'weightValue',
  'Measured By': 'measuredBy',
  'Measured Date': 'measuredDate',
  'Configuration / Included Items': 'configuration',
  'Supplier / Data Provider': 'supplier',
}
export function issueField(issue: FieldIssue): string {
  return FIELD_OF_ISSUE[issue.field] || issue.field
}

/**
 * Build a new Pending Review record exactly like the original Add Weight Record → Submit for Review:
 * same submit validation, same field normalisation, same duplicate check (warning only).
 */
export function buildSessionRecord(
  ctx: SessionContext,
  item: SessionItem,
  projects: Project[],
  existing: WeightRecord[],
): SessionBuild {
  const project = projects.find((p) => p.id === ctx.projectId)
  if (!project) return { ok: false, issues: [{ field: 'Project', message: 'Please select a project.', severity: 'error' }] }
  const weightValue = item.weightValue.trim() === '' ? null : Number(item.weightValue)
  if (item.weightValue.trim() !== '' && !Number.isFinite(weightValue)) {
    return { ok: false, issues: [{ field: 'Weight', message: 'Weight must be a valid number.', severity: 'error' }] }
  }
  const issues = validateSubmitMeasurement({
    level: ctx.level,
    description: item.description,
    weightValue,
    weightUnit: item.weightUnit,
    configuration: item.configuration,
    source: ctx.source,
    supplier: item.supplier,
    measuredBy: ctx.measuredBy,
    measuredDate: ctx.measuredDate,
  })
  if (issues.length) return { ok: false, issues }
  const stamp = nowIso()
  const showPartFields = ctx.level !== 'Package'
  const record: WeightRecord = {
    id: uid('rec'),
    projectId: project.id,
    projectCode: project.code,
    level: ctx.level,
    description: item.description.trim(),
    lenovoPn: item.lenovoPn.trim() || null,
    customerPn: item.customerPn.trim() || null,
    manufacturer: showPartFields ? item.manufacturer.trim() || null : null,
    category: item.category.trim() || (ctx.level === 'Package' ? 'Packaging' : null),
    weightValue,
    weightUnit: item.weightUnit,
    weight_kg: toWeightKg(weightValue, item.weightUnit),
    buildPhase: ctx.buildPhase.trim() || null,
    configuration: item.configuration.trim() || null,
    supplier: item.supplier.trim() || null,
    reference: item.reference.trim() || null,
    measuredBy: ctx.measuredBy.trim() || null,
    measuredDate: ctx.measuredDate || null,
    source: ctx.source,
    status: 'Pending Review',
    reviewedBy: null,
    reviewedDate: null,
    reviewComment: null,
    note: item.note.trim() || null,
    originalWeightText: null,
    createdAt: stamp,
    updatedAt: stamp,
  }
  const duplicate = findPossibleDuplicate(
    {
      projectId: record.projectId,
      buildPhase: record.buildPhase,
      level: record.level,
      description: record.description,
      lenovoPn: record.lenovoPn,
      configuration: record.configuration,
    },
    existing,
  )
  return { ok: true, record, duplicate }
}
