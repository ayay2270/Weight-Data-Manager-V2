import type { DataSource, Level, RecordStatus } from '../data/types'
import { LEVELS, RECORD_STATUSES } from '../data/types'
import { PREF_KEYS, readPref, writePref } from './prefs'
import { EMPTY_FILTERS, type GroupBy, type RecordFilterState, type SortDirection, type SortKey } from './recordFilters'

export type ColumnKey =
  | 'project'
  | 'description'
  | 'level'
  | 'lenovoPn'
  | 'customerPn'
  | 'manufacturer'
  | 'category'
  | 'buildPhase'
  | 'weight'
  | 'configuration'
  | 'source'
  | 'supplier'
  | 'reference'
  | 'measuredBy'
  | 'measuredDate'
  | 'status'
  | 'reviewedBy'
  | 'reviewComment'
  | 'note'
  | 'updated'

export const COLUMN_OPTIONS: { key: ColumnKey; label: string; locked?: boolean; sortKey?: SortKey }[] = [
  { key: 'description', label: 'Description', locked: true, sortKey: 'description' },
  { key: 'project', label: 'Project', sortKey: 'project' },
  { key: 'level', label: 'Level', sortKey: 'level' },
  { key: 'lenovoPn', label: 'Lenovo PN', sortKey: 'lenovoPn' },
  { key: 'customerPn', label: 'MSFT PN' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'category', label: 'Part Category' },
  { key: 'buildPhase', label: 'Build / Phase', sortKey: 'buildPhase' },
  { key: 'weight', label: 'Weight (kg)', sortKey: 'weight' },
  { key: 'configuration', label: 'Configuration' },
  { key: 'source', label: 'Source', sortKey: 'source' },
  { key: 'supplier', label: 'Supplier / Data Provider' },
  { key: 'reference', label: 'Reference / Document Rev.' },
  { key: 'measuredBy', label: 'Measured By', sortKey: 'measuredBy' },
  { key: 'measuredDate', label: 'Measured', sortKey: 'measuredDate' },
  { key: 'status', label: 'Status', sortKey: 'status' },
  { key: 'reviewedBy', label: 'Reviewed By' },
  { key: 'reviewComment', label: 'Review Comment' },
  { key: 'note', label: 'Note' },
  { key: 'updated', label: 'Updated', sortKey: 'updated' },
]

export const DEFAULT_COLUMNS: ColumnKey[] = ['description', 'level', 'lenovoPn', 'buildPhase', 'weight', 'source', 'measuredBy', 'measuredDate', 'status']

export function normalizeColumns(value: unknown): ColumnKey[] {
  if (!Array.isArray(value)) return DEFAULT_COLUMNS.slice()
  const allowed = COLUMN_OPTIONS.map((c) => c.key).filter((k) => value.includes(k))
  return [...new Set<ColumnKey>(['description', ...allowed])]
}

export interface RecordViewState {
  filters: RecordFilterState
  groupBy: GroupBy
  visibleColumns: ColumnKey[]
  sortKey: SortKey | null
  sortDirection: SortDirection | null
}

export interface RecordView {
  id: string
  name: string
  isDefault?: boolean
  state: RecordViewState
}

/** Shape of saved views written by the original app under `weightDataSavedViews`. */
interface V1SavedView {
  id?: string
  name?: string
  isDefault?: boolean
  state?: {
    query?: string
    projectFilter?: string
    levelFilter?: string
    statusFilter?: string
    sourceFilter?: string
    buildPhaseFilter?: string
    visibleColumns?: string[]
    sortKey?: string | null
    sortDirection?: SortDirection | null
  }
}

const V1_SORT_KEYS: SortKey[] = ['project', 'description', 'weight', 'measuredDate', 'status', 'updated']

/** Convert an original single-select saved view into a V2 multi-select view (read-only migration). */
export function migrateV1View(view: V1SavedView, index: number): RecordView | null {
  if (!view || typeof view !== 'object' || !view.state) return null
  const s = view.state
  const one = <T extends string>(value: string | undefined, allowed?: readonly T[]): T[] =>
    value && (!allowed || allowed.includes(value as T)) ? [value as T] : []
  const sortKey = V1_SORT_KEYS.includes(s.sortKey as SortKey) ? (s.sortKey as SortKey) : null
  return {
    id: view.id || `v1-${index}`,
    name: view.name || `View ${index + 1}`,
    isDefault: Boolean(view.isDefault),
    state: {
      filters: {
        ...EMPTY_FILTERS,
        query: s.query || '',
        projectCodes: one(s.projectFilter),
        levels: one<Level>(s.levelFilter, LEVELS),
        statuses: one<RecordStatus>(s.statusFilter, RECORD_STATUSES),
        sources: one<DataSource>(s.sourceFilter),
        phases: one(s.buildPhaseFilter),
      },
      groupBy: 'project',
      visibleColumns: normalizeColumns(s.visibleColumns),
      sortKey,
      sortDirection: sortKey ? s.sortDirection || 'asc' : null,
    },
  }
}

const V1_VIEWS_KEY = 'weightDataSavedViews'

/** Load V2 views; on first run, copy the original app's saved views (the original key is left untouched). */
export function loadRecordViews(): RecordView[] {
  const existing = readPref<RecordView[] | null>(PREF_KEYS.savedViews, null)
  if (Array.isArray(existing)) return existing
  const legacy = readPref<V1SavedView[]>(V1_VIEWS_KEY, [])
  const migrated = Array.isArray(legacy) ? legacy.map(migrateV1View).filter((v): v is RecordView => Boolean(v)) : []
  writePref(PREF_KEYS.savedViews, migrated)
  return migrated
}

export function saveRecordViews(views: RecordView[]): void {
  writePref(PREF_KEYS.savedViews, views)
}
