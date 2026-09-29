import type { Project, WeightRecord } from '../src/data/types'
import { normalizeWeightRecord } from '../src/utils/helpers'
import { projectFacetOptions } from '../src/utils/projectFacet'
import {
  EMPTY_FILTERS,
  facetCounts,
  filterRecords,
  groupRecords,
  parseQuery,
  sortRecords,
  statusCounts,
  toggleFacet,
} from '../src/utils/recordFilters'
import { migrateV1View, normalizeColumns } from '../src/utils/recordViews'
import { applyReview } from '../src/utils/review'
import { blankItem, buildSessionRecord, type SessionContext } from '../src/utils/session'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
  console.log(`PASS ${label}: ${actual}`)
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) throw new Error(`${label}: expected truthy, received ${actual}`)
  console.log(`PASS ${label}`)
}

const project = (id: string, code: string, phase: string | null, status: Project['status'] = 'Active', updatedAt = '2026-01-01T00:00:00Z'): Project => ({
  id, code, phase, status, notes: null, createdAt: updatedAt, updatedAt,
})

const projects: Project[] = [
  project('p1', 'S219B', 'DV'),
  project('p2', 'C21A0', 'Sustaining'),
  project('p3', 'C2184', 'PVT', 'Archived'),
]

let n = 0
function rec(partial: Partial<WeightRecord>): WeightRecord {
  n += 1
  return normalizeWeightRecord({
    id: `r${n}`,
    projectId: 'p1',
    projectCode: 'S219B',
    level: 'Part',
    description: `Item ${n}`,
    weightValue: 100,
    weightUnit: 'g',
    source: 'Internal Measurement',
    status: 'Pending Review',
    buildPhase: 'DV',
    measuredBy: 'Kevin Lin',
    measuredDate: '2026-09-01',
    createdAt: `2026-09-0${n % 9}T00:00:00Z`,
    updatedAt: `2026-09-${String(10 + n).padStart(2, '0')}T00:00:00Z`,
    ...partial,
  } as WeightRecord)
}

const records: WeightRecord[] = [
  rec({ description: 'S219B xIO Rack', level: 'Rack', weightValue: 498, weightUnit: 'kg', configuration: 'Full rack' }),
  rec({ description: 'S219B xStore Rack', level: 'Rack', weightValue: 1068, weightUnit: 'kg', status: 'Verified' }),
  rec({ description: 'Turin 64C 300W', lenovoPn: 'SSA7C10448', weightValue: 153.1 }),
  rec({ description: 'Glacier Peak', projectId: 'p2', projectCode: 'C21A0', buildPhase: 'Sustaining', status: 'Need Recheck', measuredBy: 'Amy Chen' }),
  rec({ description: 'Riser 2', projectId: 'p3', projectCode: 'C2184', buildPhase: 'PVT', status: 'Verified', source: 'Supplier', supplier: 'Wiwynn' }),
  rec({ description: 'Draft part', status: 'Draft', weightValue: null }),
]

/* ---------- facets combine with AND, values within a facet with OR ---------- */
let state = toggleFacet(EMPTY_FILTERS, 'statuses', 'Pending Review')
state = toggleFacet(state, 'levels', 'Rack')
state = toggleFacet(state, 'phases', 'DV')
assertEqual(filterRecords(records, state).map((r) => r.description).join('|'), 'S219B xIO Rack', 'Pending + Rack + DV narrows to one record')
state = toggleFacet(state, 'statuses', 'Verified')
assertEqual(filterRecords(records, state).length, 2, 'two statuses in one facet are OR-ed')
assertEqual(toggleFacet(state, 'statuses', 'Verified').statuses.join(','), 'Pending Review', 'toggling a value off removes it')

/* ---------- facet counts ignore their own facet but respect the others ---------- */
const levelOnly = toggleFacet(EMPTY_FILTERS, 'levels', 'Rack')
const statusCountsWithRack = facetCounts(records, levelOnly, 'statuses')
assertEqual(statusCountsWithRack.get('Pending Review'), 1, 'status count respects the Level facet')
assertEqual(facetCounts(records, levelOnly, 'levels').get('Part'), 4, 'level count ignores its own selection')

/* ---------- search: plain text + tokens ---------- */
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'ssa7c' }).length, 1, 'plain text matches Lenovo PN substring')
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'wiwynn' }).length, 1, 'plain text matches supplier (original search field)')
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'status:pending level:rack' }).length, 1, 'status/level tokens')
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'weight>500kg' }).length, 1, 'weight comparison in kg')
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'weight<200g' }).length, 3, 'weight comparison in g skips records with no weight')
assertEqual(filterRecords(records, { ...EMPTY_FILTERS, query: 'by:amy' }).length, 1, 'measured-by token')
assertEqual(parseQuery('project:"S219B" rack').tokens[0].value, 'S219B', 'quoted token value')

/* ---------- sorting ---------- */
assertEqual(sortRecords(records, null, null)[0].description, 'Draft part', 'default sort is most recently updated first (original behaviour)')
assertEqual(sortRecords(records, 'weight', 'desc')[0].description, 'S219B xStore Rack', 'weight sort desc')
assertEqual(sortRecords(records, 'status', 'asc')[0].status, 'Need Recheck', 'status sort puts Need Recheck first')

/* ---------- grouping ---------- */
const byProject = groupRecords(records, 'project', projects)
assertEqual(byProject.map((g) => g.label).join(','), 'S219B,C21A0,C2184', 'project groups keep project order, archived last')
assertEqual(byProject[2].archived, true, 'archived project group is flagged')
assertEqual(groupRecords(records, 'level', projects).map((g) => g.label).join(','), 'Part,Rack', 'level groups skip empty levels')
assertEqual(statusCounts(records).Verified, 2, 'status counts')

/* ---------- project facet stays bounded with many projects ---------- */
const many: Project[] = Array.from({ length: 120 }, (_, i) =>
  project(`m${i}`, `P${String(i).padStart(3, '0')}`, i % 2 ? 'DV' : 'PVT', i % 10 === 0 ? 'Archived' : 'Active', `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`),
)
const bounded = projectFacetOptions(many, [], { pinned: ['m5'], selectedCodes: ['P099'], search: '', limit: 6 })
assertEqual(bounded.items.length, 6, '120 projects → only 6 shown by default')
assertEqual(bounded.items[0].project.code, 'P005', 'pinned project listed first')
assertTruthy(bounded.items.some((o) => o.project.code === 'P099'), 'selected project always visible')
assertEqual(bounded.hiddenCount, 114, 'hidden count reported for "View all projects"')
const searched = projectFacetOptions(many, [], { pinned: [], selectedCodes: [], search: 'P11', searchLimit: 12 })
assertEqual(searched.items.length, 10, 'search finds matching projects (P110–P119)')

/* ---------- review rules (same as original Review Modal) ---------- */
const pending = records[0]
const noReviewer = applyReview(pending, 'Verified', '  ', '')
assertEqual(noReviewer.ok ? '' : noReviewer.error, 'Reviewer is required.', 'reviewer required')
const noComment = applyReview(pending, 'Rejected', 'Grace', '')
assertEqual(noComment.ok ? '' : noComment.error, 'Review Comment is required for Need Recheck or Reject.', 'comment required to reject')
const verified = applyReview(pending, 'Verified', ' Grace ', '', '2026-09-30')
assertTruthy(verified.ok && verified.record.status === 'Verified' && verified.record.reviewedBy === 'Grace' && verified.record.reviewComment === null, 'verify without comment')
assertEqual(verified.ok ? verified.record.weight_kg : null, pending.weight_kg, 'review does not touch measurement fields')
const notPending = applyReview(records[1], 'Verified', 'Grace', '')
assertEqual(notPending.ok, false, 'only Pending Review records can be reviewed')

/* ---------- measurement session builds the same record as Submit for Review ---------- */
const ctx: SessionContext = { projectId: 'p1', buildPhase: 'DV', level: 'Package', source: 'Internal Measurement', measuredBy: 'Kevin Lin', measuredDate: '2026-09-30' }
const item = { ...blankItem(ctx, 'kg'), description: 'Sleeve', manufacturer: 'ignored', weightValue: '4.83' }
assertEqual(item.category, 'Packaging', 'package items default category Packaging')
assertEqual(item.weightUnit, 'kg', 'package items default to app unit')
const built = buildSessionRecord(ctx, item, projects, records)
assertTruthy(built.ok, 'valid session item builds')
if (built.ok) {
  assertEqual(built.record.status, 'Pending Review', 'session submits for review')
  assertEqual(built.record.weight_kg, 4.83, 'canonical kg stored')
  assertEqual(built.record.manufacturer, null, 'manufacturer cleared for Package (original form rule)')
  assertEqual(built.record.projectCode, 'S219B', 'project code copied')
  assertEqual(built.duplicate, null, 'no duplicate for a new item')
}
const partCtx: SessionContext = { ...ctx, level: 'Part' }
assertEqual(blankItem(partCtx, 'kg').weightUnit, 'g', 'Part items default to grams')
const missing = buildSessionRecord({ ...ctx, measuredBy: '' }, { ...item, weightValue: '' }, projects, records)
assertEqual(missing.ok ? 0 : missing.issues.length, 2, 'missing weight and Measured By both reported')
const rackCtx: SessionContext = { ...ctx, level: 'Rack' }
const rackNoConfig = buildSessionRecord(rackCtx, { ...blankItem(rackCtx, 'kg'), description: 'Rack', weightValue: '400' }, projects, records)
assertEqual(rackNoConfig.ok ? '' : rackNoConfig.issues[0].message, 'Please specify what is included in this rack.', 'rack requires configuration')
const dup = buildSessionRecord({ ...ctx, level: 'Part' }, { ...blankItem(partCtx, 'kg'), description: 'Turin 64C 300W', lenovoPn: 'SSA7C10448', weightValue: '153' }, projects, records)
assertTruthy(dup.ok && dup.duplicate?.description === 'Turin 64C 300W', 'duplicate warning uses original duplicate rule')

/* ---------- saved views written by the original app migrate to V2 ---------- */
const migrated = migrateV1View(
  { id: 'v1', name: 'Racks pending', isDefault: true, state: { query: 'xio', projectFilter: 'S219B', levelFilter: 'Rack', statusFilter: 'Pending Review', sourceFilter: '', buildPhaseFilter: '', visibleColumns: ['project', 'description', 'weight', 'actions'], sortKey: 'weight', sortDirection: 'desc' } },
  0,
)
assertTruthy(migrated, 'v1 view migrates')
if (migrated) {
  assertEqual(migrated.state.filters.levels.join(','), 'Rack', 'level filter becomes a facet value')
  assertEqual(migrated.state.filters.sources.length, 0, 'empty filter stays unrestricted')
  assertEqual(migrated.state.visibleColumns.join(','), 'description,project,weight', 'unknown columns (actions) dropped')
  assertEqual(migrated.isDefault, true, 'default flag kept')
  assertEqual(filterRecords(records, migrated.state.filters).length, 1, 'migrated view filters the same way')
}
assertEqual(normalizeColumns('bad').includes('description'), true, 'column fallback keeps Description')

console.log('V2 logic verification complete.')
