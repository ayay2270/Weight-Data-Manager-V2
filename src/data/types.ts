export type Level = 'Part' | 'Node' | 'Rack' | 'Package'

export type DataSource =
  | 'Internal Measurement'
  | 'Supplier'
  | 'Specification'
  | 'Estimated'
  | 'Unknown'

export type RecordStatus =
  | 'Draft'
  | 'Pending Review'
  | 'Verified'
  | 'Rejected'
  | 'Need Recheck'

/** Legacy statuses that may still exist in LocalStorage. */
export type LegacyRecordStatus = 'Measured' | 'Estimated' | 'Missing'

export type ProjectStatus = 'Active' | 'Archived'

export type WeightUnit = 'g' | 'kg'

/**
 * Legacy per-level count shape retained for LocalStorage / seed compatibility.
 * Not used by product UI (Expected / Completeness was removed).
 */
export interface ExpectedItems {
  Part: number
  Node: number
  Rack: number
  Package: number
}

export interface Project {
  id: string
  code: string
  /** Optional legacy label from older saved projects. Not shown in the UI. */
  name?: string | null
  phase?: string | null
  status: ProjectStatus
  /**
   * Optional legacy field from older LocalStorage payloads.
   * New projects do not write this field. Not used by the UI.
   */
  expectedItems?: ExpectedItems
  notes?: string | null
  createdAt: string
  updatedAt: string
}

export interface WeightRecord {
  id: string
  projectId: string
  projectCode: string
  level: Level
  description: string
  lenovoPn?: string | null
  customerPn?: string | null
  manufacturer?: string | null
  category?: string | null
  weightValue?: number | null
  weightUnit: WeightUnit
  /** Canonical persisted mass, always expressed in kilograms. */
  weight_kg?: number | null
  /** Legacy camelCase field accepted when reading older browser data. */
  weightKg?: number | null
  /** Record-level build / phase (historical; not permanently bound to project phase). */
  buildPhase?: string | null
  /** What is included in the weighed configuration. */
  configuration?: string | null
  supplier?: string | null
  reference?: string | null
  measuredBy?: string | null
  measuredDate?: string | null
  source: DataSource
  status: RecordStatus
  reviewedBy?: string | null
  reviewedDate?: string | null
  reviewComment?: string | null
  note?: string | null
  originalWeightText?: string | null
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  defaultUnit: WeightUnit
  defaultProjectId?: string | null
  lastUpdated?: string
}

export interface AppData {
  version: number
  projects: Project[]
  records: WeightRecord[]
  settings: AppSettings
}

export const LEVELS: Level[] = ['Part', 'Node', 'Rack', 'Package']

export const DATA_SOURCES: DataSource[] = [
  'Internal Measurement',
  'Supplier',
  'Specification',
  'Estimated',
  'Unknown',
]

export const RECORD_STATUSES: RecordStatus[] = [
  'Draft',
  'Pending Review',
  'Verified',
  'Rejected',
  'Need Recheck',
]
