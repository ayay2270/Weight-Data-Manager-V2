import type {
  AppData,
  DataSource,
  Level,
  RecordStatus,
  WeightRecord,
  WeightUnit,
} from '../data/types'
import { DATA_SOURCES, RECORD_STATUSES } from '../data/types'

export function nowIso(): string {
  return new Date().toISOString()
}

export function todayDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function statusBadgeClass(status: string): string {
  return status.replace(/\s+/g, '-')
}

/** Tester may edit measurement data for Draft, Need Recheck, or Verified. */
export function canEditMeasurement(status: string): boolean {
  return status === 'Draft' || status === 'Need Recheck' || status === 'Verified'
}

/** Projects with child records cannot be deleted from the data layer. */
export function canDeleteProject(projectId: string, records: WeightRecord[]): boolean {
  return !records.some((record) => record.projectId === projectId)
}

const DATA_SOURCE_SET = new Set<string>(DATA_SOURCES)
const RECORD_STATUS_SET = new Set<string>(RECORD_STATUSES)

export function migrateRecordStatus(
  status: unknown,
  source?: unknown,
): { status: RecordStatus; source?: DataSource } {
  const raw = typeof status === 'string' ? status.trim() : ''
  if (RECORD_STATUS_SET.has(raw)) {
    return { status: raw as RecordStatus }
  }
  switch (raw) {
    case 'Measured':
      return { status: 'Pending Review' }
    case 'Estimated': {
      const src = typeof source === 'string' ? source.trim() : ''
      if (!src || src === 'Unknown' || !DATA_SOURCE_SET.has(src)) {
        return { status: 'Pending Review', source: 'Estimated' }
      }
      return { status: 'Pending Review' }
    }
    case 'Missing':
      return { status: 'Need Recheck' }
    default:
      return { status: 'Draft' }
  }
}

export function normalizeDataSource(source: unknown, fallback: DataSource = 'Unknown'): DataSource {
  const raw = typeof source === 'string' ? source.trim() : ''
  return DATA_SOURCE_SET.has(raw) ? (raw as DataSource) : fallback
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

export function cleanText(value: unknown): string | null {
  if (value == null) return null
  let s = String(value).replace(/\u200b/g, '').replace(/\u00a0/g, ' ').trim()
  if (!s || s.toUpperCase() === 'NA') return null
  s = s.replace(/导轨/g, '導軌').replace(/配线/g, '配線')
  return s
}

export function toWeightKg(value: number | null | undefined, unit: WeightUnit): number | null {
  if (value == null || Number.isNaN(value)) return null
  return unit === 'g' ? value / 1000 : value
}

export function getWeightKg(record: Pick<WeightRecord, 'weight_kg' | 'weightKg' | 'weightValue' | 'weightUnit'>): number | null {
  if (typeof record.weight_kg === 'number' && Number.isFinite(record.weight_kg)) return record.weight_kg
  if (typeof record.weightKg === 'number' && Number.isFinite(record.weightKg)) return record.weightKg
  return toWeightKg(record.weightValue, record.weightUnit)
}

export function normalizeWeightRecord<T extends Partial<WeightRecord>>(record: T): T & WeightRecord {
  const weightUnit: WeightUnit = record.weightUnit === 'g' ? 'g' : 'kg'
  const legacyWeight = typeof record.weightValue === 'number' && Number.isFinite(record.weightValue) ? record.weightValue : null
  const suppliedCanonical =
    typeof record.weight_kg === 'number' && Number.isFinite(record.weight_kg)
      ? record.weight_kg
      : typeof record.weightKg === 'number' && Number.isFinite(record.weightKg)
        ? record.weightKg
        : null
  const weight_kg = legacyWeight == null ? suppliedCanonical : toWeightKg(legacyWeight, weightUnit)
  const { weightKg: _legacyWeightKg, ...withoutLegacyWeightKg } = record
  const migrated = migrateRecordStatus(record.status, record.source)
  const source = normalizeDataSource(migrated.source ?? record.source)
  return {
    ...withoutLegacyWeightKg,
    weightValue: legacyWeight ?? weight_kg,
    weightUnit: legacyWeight == null ? 'kg' : weightUnit,
    weight_kg,
    buildPhase: record.buildPhase ?? null,
    configuration: record.configuration ?? null,
    supplier: record.supplier ?? null,
    reference: record.reference ?? null,
    measuredBy: record.measuredBy ?? null,
    measuredDate: record.measuredDate ?? null,
    reviewedBy: record.reviewedBy ?? null,
    reviewedDate: record.reviewedDate ?? null,
    reviewComment: record.reviewComment ?? null,
    source,
    status: migrated.status,
  } as T & WeightRecord
}

export function formatWeightKg(record: Pick<WeightRecord, 'weight_kg' | 'weightKg' | 'weightValue' | 'weightUnit'>): string {
  const weightKg = getWeightKg(record)
  return weightKg == null ? '—' : `${weightKg.toFixed(3)} kg`
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = iso.slice(0, 10)
  return d
}

export function countByLevel(records: WeightRecord[]): Record<Level, number> {
  const out: Record<Level, number> = { Part: 0, Node: 0, Rack: 0, Package: 0 }
  for (const r of records) out[r.level] += 1
  return out
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function latestUpdated(data: AppData): string | null {
  const times = [
    data.settings.lastUpdated,
    ...data.projects.map((p) => p.updatedAt),
    ...data.records.map((r) => r.updatedAt),
  ].filter(Boolean) as string[]
  if (!times.length) return null
  return times.sort().at(-1) ?? null
}
