import { exportCsv } from '../src/utils/io'
import { findPossibleDuplicate } from '../src/utils/duplicates'
import { canDeleteProject, canEditMeasurement, migrateRecordStatus, normalizeWeightRecord, toWeightKg } from '../src/utils/helpers'
import { normalizeAppData } from '../src/utils/storage'
import type { AppData, WeightRecord } from '../src/data/types'

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}`)
  console.log(`PASS ${label}: ${actual}`)
}

function assertTruthy(actual: unknown, label: string) {
  if (!actual) throw new Error(`${label}: expected truthy, received ${actual}`)
  console.log(`PASS ${label}`)
}

const base: AppData = {
  version: 1,
  projects: [
    {
      id: 'prj_s219b',
      code: 'S219B',
      name: 'S219B Rack Platform',
      phase: 'DV',
      status: 'Active',
      expectedItems: { Part: 1, Node: 0, Rack: 0, Package: 0 },
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'prj_e2010',
      code: 'E2010',
      name: 'E2010 Packaging',
      phase: null,
      status: 'Active',
      expectedItems: { Part: 0, Node: 0, Rack: 0, Package: 1 },
      createdAt: '',
      updatedAt: '',
    },
  ],
  records: [],
  settings: { defaultUnit: 'kg' },
}

assertEqual(migrateRecordStatus('Draft').status, 'Draft', 'migrate Draft')
assertEqual(migrateRecordStatus('Measured').status, 'Pending Review', 'migrate Measured')
assertEqual(migrateRecordStatus('Verified').status, 'Verified', 'migrate Verified')
assertEqual(migrateRecordStatus('Estimated', 'Unknown').status, 'Pending Review', 'migrate Estimated status')
assertEqual(migrateRecordStatus('Estimated', 'Unknown').source, 'Estimated', 'migrate Estimated source')
assertEqual(migrateRecordStatus('Missing').status, 'Need Recheck', 'migrate Missing')

const legacy = normalizeAppData({
  ...base,
  records: [
    {
      id: 'legacy',
      projectId: 'prj_s219b',
      projectCode: 'S219B',
      level: 'Part',
      description: 'Legacy MB',
      weightValue: 1180,
      weightUnit: 'g',
      source: 'Unknown',
      status: 'Measured',
      createdAt: '',
      updatedAt: '',
    } as unknown as WeightRecord,
    {
      id: 'legacy_est',
      projectId: 'prj_s219b',
      projectCode: 'S219B',
      level: 'Part',
      description: 'Legacy estimated',
      weightValue: 100,
      weightUnit: 'g',
      source: 'Unknown',
      status: 'Estimated',
      createdAt: '',
      updatedAt: '',
    } as unknown as WeightRecord,
    {
      id: 'legacy_missing',
      projectId: 'prj_s219b',
      projectCode: 'S219B',
      level: 'Part',
      description: 'Legacy missing',
      weightUnit: 'g',
      source: 'Unknown',
      status: 'Missing',
      createdAt: '',
      updatedAt: '',
    } as unknown as WeightRecord,
  ],
})

assertEqual(legacy.records[0].status, 'Pending Review', 'legacy Measured → Pending Review')
assertEqual(legacy.records[0].buildPhase, null, 'legacy missing buildPhase defaults null')
assertEqual(legacy.records[0].configuration, null, 'legacy missing configuration defaults null')
assertEqual(legacy.records[0].measuredBy, null, 'legacy missing measuredBy defaults null')
assertEqual(legacy.records[0].reviewedBy, null, 'legacy missing reviewedBy defaults null')
assertEqual(legacy.records[1].status, 'Pending Review', 'legacy Estimated → Pending Review')
assertEqual(legacy.records[1].source, 'Estimated', 'legacy Estimated sets Source Estimated')
assertEqual(legacy.records[2].status, 'Need Recheck', 'legacy Missing → Need Recheck')

// Scenario 1: Internal Measurement → Pending Review → Verified
const scenario1 = normalizeWeightRecord({
  id: 's1',
  projectId: 'prj_s219b',
  projectCode: 'S219B',
  level: 'Part',
  description: 'S219B MB',
  weightValue: 1180,
  weightUnit: 'g',
  buildPhase: 'DV',
  configuration: 'Bare motherboard',
  source: 'Internal Measurement',
  measuredBy: 'Amy',
  measuredDate: '2026-09-22',
  status: 'Pending Review',
  createdAt: '',
  updatedAt: '',
})
assertEqual(toWeightKg(1180, 'g'), 1.18, 'scenario1 normalized kg')
assertEqual(scenario1.weight_kg, 1.18, 'scenario1 weight_kg')
const verified = normalizeWeightRecord({
  ...scenario1,
  status: 'Verified',
  reviewedBy: 'Jason',
  reviewedDate: '2026-09-23',
})
assertEqual(verified.status, 'Verified', 'scenario1 verified status')
assertEqual(verified.reviewedBy, 'Jason', 'scenario1 reviewedBy')
assertEqual(verified.reviewedDate, '2026-09-23', 'scenario1 reviewedDate')
assertEqual(verified.configuration, 'Bare motherboard', 'scenario1 configuration persists')

// Scenario 2: Supplier data
const scenario2 = normalizeWeightRecord({
  id: 's2',
  projectId: 'prj_e2010',
  projectCode: 'E2010',
  level: 'Package',
  description: 'E2010 Sleeve',
  weightValue: 4.83,
  weightUnit: 'kg',
  configuration: 'Sleeve only',
  source: 'Supplier',
  supplier: 'Bromake',
  reference: 'PKG Weight List Rev.B',
  status: 'Pending Review',
  createdAt: '',
  updatedAt: '',
})
assertEqual(scenario2.supplier, 'Bromake', 'scenario2 supplier')
assertEqual(scenario2.reference, 'PKG Weight List Rev.B', 'scenario2 reference')
assertEqual(scenario2.weight_kg, 4.83, 'scenario2 weight_kg')
const scenario2Edit = normalizeWeightRecord({ ...scenario2, note: 'checked' })
assertEqual(scenario2Edit.supplier, 'Bromake', 'scenario2 supplier survives edit')
assertEqual(scenario2Edit.reference, 'PKG Weight List Rev.B', 'scenario2 reference survives edit')

// Scenario 3: Configuration as formal field
const scenario3 = normalizeWeightRecord({
  id: 's3',
  projectId: 'prj_s219b',
  projectCode: 'S219B',
  level: 'Rack',
  description: 'S219B L11 xIO',
  weightValue: 498,
  weightUnit: 'kg',
  configuration: 'Full rack + pallet',
  source: 'Internal Measurement',
  status: 'Pending Review',
  createdAt: '',
  updatedAt: '',
})
assertEqual(scenario3.configuration, 'Full rack + pallet', 'scenario3 configuration saved')
assertEqual(scenario3.description, 'S219B L11 xIO', 'scenario3 description separate')

// Review workflow: Need Recheck → resubmit keeps review comment context, status Pending Review
const recheck = normalizeWeightRecord({
  ...scenario1,
  status: 'Need Recheck',
  reviewedBy: 'Jason',
  reviewedDate: '2026-09-23',
  reviewComment: 'Please re-weigh without heatsink',
})
const resubmitted = normalizeWeightRecord({
  ...recheck,
  weightValue: 1200,
  weightUnit: 'g',
  status: 'Pending Review',
  reviewedBy: null,
  reviewedDate: null,
  reviewComment: null,
})
assertEqual(resubmitted.status, 'Pending Review', 'resubmit → Pending Review')
assertEqual(resubmitted.reviewedBy, null, 'resubmit clears reviewedBy for a new review round')
assertEqual(resubmitted.reviewComment, null, 'resubmit clears review comment')
assertEqual(resubmitted.weight_kg, 1.2, 'resubmit updates measurement weight')

// Edit permission + Verified re-edit workflow
assertEqual(canEditMeasurement('Draft'), true, 'A Draft → Edit allowed')
assertEqual(canEditMeasurement('Need Recheck'), true, 'B Need Recheck → Edit allowed')
assertEqual(canEditMeasurement('Verified'), true, 'C Verified → Edit allowed')
assertEqual(canEditMeasurement('Pending Review'), false, 'D Pending Review → Edit NOT allowed')
assertEqual(canEditMeasurement('Rejected'), false, 'E Rejected → Edit NOT allowed')

const verifiedEdited = normalizeWeightRecord({
  ...verified,
  weightValue: 1.2,
  weightUnit: 'kg',
  status: 'Pending Review',
  reviewedBy: null,
  reviewedDate: null,
  reviewComment: null,
})
assertEqual(verifiedEdited.weight_kg, 1.2, 'F verified edit weight')
assertEqual(verifiedEdited.status, 'Pending Review', 'F Verified Save → Pending Review')
assertEqual(verifiedEdited.reviewedBy, null, 'F verified edit clears reviewedBy')
assertEqual(verifiedEdited.reviewedDate, null, 'F verified edit clears reviewedDate')
assertEqual(verifiedEdited.reviewComment, null, 'F verified edit clears reviewComment')

assertEqual(verified.status, 'Verified', 'G Cancel leaves source Verified')
assertEqual(verified.reviewedBy, 'Jason', 'G Cancel keeps reviewedBy')
assertEqual(verified.reviewedDate, '2026-09-23', 'G Cancel keeps reviewedDate')

const duplicatedDraft = normalizeWeightRecord({
  ...verified,
  id: 'rec_dup_draft',
  status: 'Draft',
  reviewedBy: null,
  reviewedDate: null,
  reviewComment: null,
})
assertEqual(duplicatedDraft.status, 'Draft', 'H Duplicate → Draft')
assertEqual(duplicatedDraft.reviewedBy, null, 'H Duplicate clears reviewedBy')
assertEqual(duplicatedDraft.reviewedDate, null, 'H Duplicate clears reviewedDate')
assertEqual(duplicatedDraft.reviewComment, null, 'H Duplicate clears reviewComment')

const exported = exportCsv({
  ...base,
  records: [verified, scenario2, scenario3],
})
assertTruthy(exported.includes('Build / Phase'), 'export has Build / Phase')
assertTruthy(exported.includes('Configuration / Included Items'), 'export has Configuration')
assertTruthy(exported.includes('Supplier / Data Provider'), 'export has Supplier')
assertTruthy(exported.includes('Reference / Document Rev.'), 'export has Reference')
assertTruthy(exported.includes('Measured By'), 'export has Measured By')
assertTruthy(exported.includes('Reviewed By'), 'export has Reviewed By')
assertTruthy(exported.includes('Reviewed Date'), 'export has Reviewed Date')
assertTruthy(exported.includes('Full rack + pallet'), 'export includes configuration value')
assertTruthy(exported.includes('Bromake'), 'export includes supplier value')

// Legacy expectedItems is ignored on load and does not block the project
assertEqual(legacy.projects[0].code, 'S219B', 'legacy project with expectedItems still loads')
assertEqual('expectedItems' in legacy.projects[0], false, 'expectedItems is ignored after load')
const withoutExpected = normalizeAppData({
  ...base,
  projects: [
    {
      id: 'prj_new',
      code: 'NEW',
      name: 'New project',
      status: 'Active',
      createdAt: '',
      updatedAt: '',
    },
  ],
})
assertEqual('expectedItems' in withoutExpected.projects[0], false, 'new project does not gain expectedItems')

// Duplicate detection
const dupBase: WeightRecord[] = [
  {
    id: 'dup1',
    projectId: 'prj_s219b',
    projectCode: 'S219B',
    level: 'Part',
    description: 'S219B MB',
    buildPhase: 'DV',
    lenovoPn: '5C11A12345',
    configuration: 'Bare motherboard',
    weightValue: 1180,
    weightUnit: 'g',
    source: 'Internal Measurement',
    status: 'Verified',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'dup2',
    projectId: 'prj_s219b',
    projectCode: 'S219B',
    level: 'Node',
    description: 'Cable kit',
    buildPhase: 'DV',
    configuration: 'Cables only',
    weightValue: 1,
    weightUnit: 'kg',
    source: 'Internal Measurement',
    status: 'Draft',
    createdAt: '',
    updatedAt: '',
  },
]

assertEqual(
  findPossibleDuplicate(
    {
      projectId: 'prj_s219b',
      level: 'Part',
      description: 'Other',
      lenovoPn: '5C11A12345',
      configuration: null,
      buildPhase: 'DV',
    },
    dupBase,
  )?.id,
  'dup1',
  'duplicate matches project + PN + level + build phase',
)

assertEqual(
  findPossibleDuplicate(
    {
      projectId: 'prj_s219b',
      level: 'Rack',
      description: 'S219B MB',
      lenovoPn: '5C11A12345',
      configuration: 'Bare motherboard',
      buildPhase: 'DV',
    },
    dupBase,
  ),
  null,
  'different level is not a strong duplicate',
)

assertEqual(
  findPossibleDuplicate(
    {
      projectId: 'prj_s219b',
      level: 'Node',
      description: 'Cable kit',
      lenovoPn: null,
      configuration: 'Cables only',
      buildPhase: 'DV',
    },
    dupBase,
  )?.id,
  'dup2',
  'duplicate soft-matches project+level+description+config without PN',
)

assertEqual(
  findPossibleDuplicate(
    {
      projectId: 'prj_s219b',
      level: 'Part',
      description: 'Totally different',
      lenovoPn: 'OTHER',
      configuration: 'x',
      buildPhase: 'DV',
    },
    dupBase,
  ),
  null,
  'non-duplicate returns null',
)

assertEqual(canDeleteProject('prj_empty', []), true, 'empty project can be deleted')
assertEqual(
  canDeleteProject(
    'prj_s219b',
    [{ id: 'rec1', projectId: 'prj_s219b', projectCode: 'S219B', level: 'Part', description: 'x', weightUnit: 'g', source: 'Unknown', status: 'Draft', createdAt: '', updatedAt: '' }],
  ),
  false,
  'project with records cannot be deleted',
)

console.log('Workflow verification complete.')
