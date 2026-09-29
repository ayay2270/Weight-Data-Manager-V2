import type { DataSource, Level, Project, RecordStatus, WeightRecord } from '../data/types'
import { LEVELS } from '../data/types'
import { getWeightKg } from './helpers'

/** Multi-select facet state used by All Records (V2). Empty array = no restriction. */
export interface RecordFilterState {
  query: string
  statuses: RecordStatus[]
  projectCodes: string[]
  levels: Level[]
  phases: string[]
  sources: DataSource[]
  measuredBy: string[]
}

export type FacetKey = 'statuses' | 'projectCodes' | 'levels' | 'phases' | 'sources' | 'measuredBy'

export const EMPTY_FILTERS: RecordFilterState = {
  query: '',
  statuses: [],
  projectCodes: [],
  levels: [],
  phases: [],
  sources: [],
  measuredBy: [],
}

export type SortKey =
  | 'project'
  | 'description'
  | 'level'
  | 'lenovoPn'
  | 'buildPhase'
  | 'weight'
  | 'source'
  | 'measuredBy'
  | 'measuredDate'
  | 'status'
  | 'updated'
export type SortDirection = 'asc' | 'desc'

/** Workflow order used for status chips, facets and groups (the data-model constant keeps its original order). */
export const STATUS_DISPLAY_ORDER: RecordStatus[] = ['Draft', 'Pending Review', 'Need Recheck', 'Verified', 'Rejected']

export type GroupBy = 'project' | 'level' | 'status' | 'phase' | 'none'

/** Value a record contributes to each facet. Records without a value use '' (shown as "None"). */
export function facetValue(record: WeightRecord, key: FacetKey): string {
  switch (key) {
    case 'statuses':
      return record.status
    case 'projectCodes':
      return record.projectCode || ''
    case 'levels':
      return record.level
    case 'phases':
      return record.buildPhase || ''
    case 'sources':
      return record.source
    case 'measuredBy':
      return record.measuredBy || ''
  }
}

/* ---------------- search ---------------- */

const STATUS_ALIASES: Record<string, RecordStatus> = {
  draft: 'Draft',
  pending: 'Pending Review',
  'pending review': 'Pending Review',
  recheck: 'Need Recheck',
  'need recheck': 'Need Recheck',
  verified: 'Verified',
  rejected: 'Rejected',
}

export interface ParsedQuery {
  terms: string[]
  tokens: { key: 'project' | 'level' | 'status' | 'source' | 'phase' | 'by'; value: string }[]
  weight: { op: '>' | '<' | '>=' | '<='; kg: number }[]
}

const TOKEN_KEYS: Record<string, ParsedQuery['tokens'][number]['key']> = {
  project: 'project',
  level: 'level',
  status: 'status',
  source: 'source',
  phase: 'phase',
  build: 'phase',
  by: 'by',
}

/**
 * Plain words are matched as substrings across the same fields the original Weight Data search used.
 * Optional tokens narrow further: project:S219B level:rack status:pending source:supplier phase:DV by:kevin
 * and weight comparisons such as weight>1kg or weight<=500g.
 */
export function parseQuery(query: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], tokens: [], weight: [] }
  const re = /weight\s*(>=|<=|>|<)\s*([\d.]+)\s*(kg|g)?|(\w+):("([^"]*)"|\S+)|"([^"]+)"|(\S+)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(query))) {
    if (m[1]) {
      let kg = Number(m[2])
      if (!Number.isFinite(kg)) continue
      if ((m[3] || 'kg').toLowerCase() === 'g') kg /= 1000
      out.weight.push({ op: m[1] as ParsedQuery['weight'][number]['op'], kg })
    } else if (m[4] && TOKEN_KEYS[m[4].toLowerCase()]) {
      out.tokens.push({ key: TOKEN_KEYS[m[4].toLowerCase()], value: (m[6] ?? m[5]).trim() })
    } else {
      const text = (m[7] || m[8] || m[0]).trim().toLowerCase()
      if (text) out.terms.push(text)
    }
  }
  return out
}

function searchHaystack(r: WeightRecord): string[] {
  return [
    r.description,
    r.lenovoPn,
    r.customerPn,
    r.manufacturer,
    r.category,
    r.projectCode,
    r.buildPhase,
    r.configuration,
    r.supplier,
    r.reference,
    r.measuredBy,
    r.reviewedBy,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
}

export function matchesQuery(record: WeightRecord, parsed: ParsedQuery): boolean {
  const lower = (v?: string | null) => (v || '').toLowerCase()
  for (const token of parsed.tokens) {
    const v = token.value.toLowerCase()
    if (token.key === 'project' && lower(record.projectCode) !== v) return false
    if (token.key === 'level' && lower(record.level) !== v) return false
    if (token.key === 'status' && record.status !== (STATUS_ALIASES[v] || token.value)) return false
    if (token.key === 'source' && !lower(record.source).includes(v)) return false
    if (token.key === 'phase' && lower(record.buildPhase) !== v) return false
    if (token.key === 'by' && !lower(record.measuredBy).includes(v)) return false
  }
  if (parsed.weight.length) {
    const kg = getWeightKg(record)
    if (kg == null) return false
    for (const w of parsed.weight) {
      if (w.op === '>' && !(kg > w.kg)) return false
      if (w.op === '<' && !(kg < w.kg)) return false
      if (w.op === '>=' && !(kg >= w.kg)) return false
      if (w.op === '<=' && !(kg <= w.kg)) return false
    }
  }
  if (!parsed.terms.length) return true
  const hay = searchHaystack(record)
  return parsed.terms.every((term) => hay.some((field) => field.includes(term)))
}

/* ---------------- filtering / faceting ---------------- */

const FACET_KEYS: FacetKey[] = ['statuses', 'projectCodes', 'levels', 'phases', 'sources', 'measuredBy']

/** Apply every facet (optionally skipping one, for facet counts) plus the search query. Facets combine with AND. */
export function filterRecords(records: WeightRecord[], state: RecordFilterState, omit?: FacetKey): WeightRecord[] {
  const parsed = parseQuery(state.query)
  const active = FACET_KEYS.filter((key) => key !== omit && state[key].length > 0).map(
    (key) => [key, new Set<string>(state[key])] as const,
  )
  return records.filter((record) => {
    for (const [key, allowed] of active) {
      if (!allowed.has(facetValue(record, key))) return false
    }
    return matchesQuery(record, parsed)
  })
}

/** Counts per facet value, computed with all other facets applied (standard faceted-search behavior). */
export function facetCounts(records: WeightRecord[], state: RecordFilterState, key: FacetKey): Map<string, number> {
  const counts = new Map<string, number>()
  for (const record of filterRecords(records, state, key)) {
    const value = facetValue(record, key)
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return counts
}

export function toggleFacet<K extends FacetKey>(state: RecordFilterState, key: K, value: RecordFilterState[K][number]): RecordFilterState {
  const list = state[key] as string[]
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
  return { ...state, [key]: next }
}

export function activeFilterCount(state: RecordFilterState): number {
  return FACET_KEYS.reduce((n, key) => n + state[key].length, 0) + (state.query.trim() ? 1 : 0)
}

/* ---------------- sorting ---------------- */

const STATUS_ORDER: Record<RecordStatus, number> = {
  'Need Recheck': 0,
  'Pending Review': 1,
  Draft: 2,
  Rejected: 3,
  Verified: 4,
}

/** No sort key = most recently updated first (same default as the original Weight Data page). */
export function sortRecords(records: WeightRecord[], key: SortKey | null, direction: SortDirection | null): WeightRecord[] {
  const list = records.slice()
  if (!key || !direction) return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  const dir = direction === 'asc' ? 1 : -1
  const field = (r: WeightRecord): string | number => {
    switch (key) {
      case 'project':
        return r.projectCode || ''
      case 'description':
        return r.description || ''
      case 'level':
        return LEVELS.indexOf(r.level)
      case 'lenovoPn':
        return r.lenovoPn || ''
      case 'buildPhase':
        return r.buildPhase || ''
      case 'weight':
        return getWeightKg(r) ?? -1
      case 'source':
        return r.source || ''
      case 'measuredBy':
        return r.measuredBy || ''
      case 'measuredDate':
        return r.measuredDate || ''
      case 'status':
        return STATUS_ORDER[r.status] ?? 9
      case 'updated':
        return r.updatedAt || ''
    }
  }
  return list.sort((a, b) => {
    const left = field(a)
    const right = field(b)
    return typeof left === 'number' && typeof right === 'number'
      ? (left - right) * dir
      : String(left).localeCompare(String(right)) * dir
  })
}

/* ---------------- grouping ---------------- */

export interface RecordGroup {
  key: string
  label: string
  sublabel?: string | null
  archived?: boolean
  projectId?: string
  records: WeightRecord[]
}

export function groupRecords(records: WeightRecord[], by: GroupBy, projects: Project[]): RecordGroup[] {
  if (by === 'none') return [{ key: 'all', label: 'All records', records }]
  if (by === 'project') {
    const ordered = [...projects.filter((p) => p.status === 'Active'), ...projects.filter((p) => p.status !== 'Active')]
    const groups: RecordGroup[] = ordered.map((p) => ({
      key: `project:${p.id}`,
      label: p.code,
      sublabel: p.phase,
      archived: p.status === 'Archived',
      projectId: p.id,
      records: records.filter((r) => r.projectId === p.id),
    }))
    const known = new Set(projects.map((p) => p.id))
    const orphans = records.filter((r) => !known.has(r.projectId))
    if (orphans.length) groups.push({ key: 'project:?', label: 'Unknown project', records: orphans })
    return groups.filter((g) => g.records.length)
  }
  const keys: string[] =
    by === 'level'
      ? LEVELS
      : by === 'status'
        ? STATUS_DISPLAY_ORDER
        : [...new Set(records.map((r) => r.buildPhase || ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1))
  return keys
    .map((k) => ({
      key: `${by}:${k}`,
      label: k || 'No build / phase',
      records: records.filter((r) => (by === 'level' ? r.level : by === 'status' ? r.status : r.buildPhase || '') === k),
    }))
    .filter((g) => g.records.length)
}

export function statusCounts(records: WeightRecord[]): Record<RecordStatus, number> {
  const out: Record<RecordStatus, number> = { Draft: 0, 'Pending Review': 0, 'Need Recheck': 0, Verified: 0, Rejected: 0 }
  for (const r of records) out[r.status] = (out[r.status] || 0) + 1
  return out
}
