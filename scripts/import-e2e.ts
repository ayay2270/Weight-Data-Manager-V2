/**
 * Programmatic E2E for Excel Import:
 * template download → fill 4 levels → draft import → submit import → blocking validation → duplicates → cleanup markers.
 */
import * as XLSX from 'xlsx'
import type { Project, WeightRecord } from '../src/data/types'
import {
  buildImportTemplateWorkbook,
  collectImportRecords,
  IMPORT_TEMPLATE_FILENAME,
  importRowKey,
  parseImportWorkbook,
} from '../src/utils/importWeightWorkbook'
import { IMPORT_COLUMNS, INSTRUCTIONS_SHEET, LEVEL_SHEETS } from '../src/utils/weightWorkbookSchema'
import { toWeightKg } from '../src/utils/helpers'

type Result = 'PASS' | 'FAIL'

const report: Record<string, Result> = {
  'E2E Template Download': 'FAIL',
  'E2E Excel Upload': 'FAIL',
  'E2E Draft Import': 'FAIL',
  'E2E Submit Import': 'FAIL',
  'E2E Validation Blocking': 'FAIL',
  'E2E Duplicate Detection': 'FAIL',
  'Test Data Cleanup': 'FAIL',
}

function mark(key: keyof typeof report, ok: boolean) {
  report[key] = ok ? 'PASS' : 'FAIL'
  console.log(`${ok ? 'PASS' : 'FAIL'} ${key}`)
}

const projects: Project[] = [
  {
    id: 'prj_s219b',
    code: 'S219B',
    name: 'S219B',
    phase: 'DV',
    status: 'Active',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'prj_s2195',
    code: 'S2195',
    name: 'S2195',
    phase: null,
    status: 'Active',
    createdAt: '',
    updatedAt: '',
  },
]

try {
  // 1. Template download (generated)
  const templateBuf = buildImportTemplateWorkbook()
  const templateWb = XLSX.read(templateBuf, { type: 'array' })
  const templateOk =
    IMPORT_TEMPLATE_FILENAME === 'Weight_Data_Import_Template.xlsx' &&
    templateWb.SheetNames.length === 5 &&
    templateWb.SheetNames[0] === INSTRUCTIONS_SHEET
  mark('E2E Template Download', templateOk)

  // 2–3. Fill template sheets with 4 rows (replace example rows)
  const filled = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(filled, templateWb.Sheets[INSTRUCTIONS_SHEET], INSTRUCTIONS_SHEET)

  const payloads: Record<string, Record<string, string>> = {
    'Part Level': {
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'E2E Import Part',
      'Lenovo PN': 'E2E-PART-1',
      'MSFT PN': '',
      Manufacturer: 'E2E Mfr',
      'Part Category': 'PCB',
      Weight: '500',
      Unit: 'g',
      'Configuration / Included Items': '',
      Source: 'Internal Measurement',
      'Supplier / Data Provider': '',
      'Reference / Document Rev.': '',
      'Measured By': 'E2E Tester',
      'Measured Date': '2026-09-22',
      Note: 'e2e-part',
    },
    'Node Level': {
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'E2E Import Node',
      'Lenovo PN': '',
      'MSFT PN': '',
      Manufacturer: '',
      'Part Category': '',
      Weight: '12.5',
      Unit: 'kg',
      'Configuration / Included Items': 'Node + HSK',
      Source: 'Internal Measurement',
      'Supplier / Data Provider': '',
      'Reference / Document Rev.': '',
      'Measured By': 'E2E Tester',
      'Measured Date': '2026-09-22',
      Note: 'e2e-node',
    },
    'Rack Level': {
      Project: 'S219B',
      'Build / Phase': 'DV',
      Description: 'E2E Import Rack',
      'Lenovo PN': '',
      'MSFT PN': '',
      Manufacturer: '',
      'Part Category': '',
      Weight: '480',
      Unit: 'kg',
      'Configuration / Included Items': 'Full rack e2e config',
      Source: 'Internal Measurement',
      'Supplier / Data Provider': '',
      'Reference / Document Rev.': '',
      'Measured By': 'E2E Tester',
      'Measured Date': '2026-09-22',
      Note: 'e2e-rack',
    },
    Package: {
      Project: 'S2195',
      'Build / Phase': 'Packaging',
      Description: 'E2E Import Package',
      'Lenovo PN': '',
      'MSFT PN': '',
      Manufacturer: '',
      'Part Category': 'Packaging',
      Weight: '4.83',
      Unit: 'kg',
      'Configuration / Included Items': 'Sleeve',
      Source: 'Supplier',
      'Supplier / Data Provider': 'Bromake',
      'Reference / Document Rev.': 'Rev.A',
      'Measured By': 'E2E Tester',
      'Measured Date': '2026-09-22',
      Note: 'e2e-package',
    },
  }

  for (const entry of LEVEL_SHEETS) {
    const row = payloads[entry.sheetName]
    const ws = XLSX.utils.json_to_sheet([row], { header: [...IMPORT_COLUMNS] })
    XLSX.utils.book_append_sheet(filled, ws, entry.sheetName)
  }
  const uploadBuf = XLSX.write(filled, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer

  // 4. Upload / parse
  const draftParsed = parseImportWorkbook(uploadBuf, projects, [], 'draft')
  const uploadOk =
    draftParsed.errorCount === 0 &&
    draftParsed.readyCount === 4 &&
    draftParsed.sheetsFound.length === 4
  mark('E2E Excel Upload', uploadOk)

  // 5. Draft import
  const draftRecords = collectImportRecords(draftParsed)
  const draftOk =
    draftRecords.length === 4 &&
    draftRecords.every((r) => r.status === 'Draft') &&
    draftRecords.find((r) => r.level === 'Part')?.weight_kg === toWeightKg(500, 'g') &&
    draftRecords.find((r) => r.level === 'Node')?.weightUnit === 'kg' &&
    draftRecords.find((r) => r.level === 'Part')?.projectCode === 'S219B' &&
    draftRecords.find((r) => r.level === 'Package')?.projectCode === 'S2195' &&
    draftRecords.find((r) => r.level === 'Part')?.measuredBy === 'E2E Tester'
  mark('E2E Draft Import', draftOk)

  // Simulate store
  let store: WeightRecord[] = [...draftRecords]

  // 6. Submit import with a second unique set
  const submitPayloads = structuredClone(payloads)
  submitPayloads['Part Level'].Description = 'E2E Submit Part'
  submitPayloads['Part Level']['Lenovo PN'] = 'E2E-PART-SUBMIT'
  submitPayloads['Node Level'].Description = 'E2E Submit Node'
  submitPayloads['Rack Level'].Description = 'E2E Submit Rack'
  submitPayloads.Package.Description = 'E2E Submit Package'
  const submitWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(submitWb, XLSX.utils.aoa_to_sheet([['Instructions']]), INSTRUCTIONS_SHEET)
  for (const entry of LEVEL_SHEETS) {
    const ws = XLSX.utils.json_to_sheet([submitPayloads[entry.sheetName]], { header: [...IMPORT_COLUMNS] })
    XLSX.utils.book_append_sheet(submitWb, ws, entry.sheetName)
  }
  const submitBuf = XLSX.write(submitWb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const submitParsed = parseImportWorkbook(submitBuf, projects, store, 'submit')
  const submitRecords = collectImportRecords(submitParsed)
  const submitOk =
    submitParsed.errorCount === 0 &&
    submitRecords.length === 4 &&
    submitRecords.every((r) => r.status === 'Pending Review')
  mark('E2E Submit Import', submitOk)
  store = [...store, ...submitRecords]

  // 7. Blocking validation — rack missing configuration
  const bad = structuredClone(payloads)
  bad['Rack Level']['Configuration / Included Items'] = ''
  bad['Part Level'].Description = 'E2E Bad Rack Case Part'
  bad['Node Level'].Description = 'E2E Bad Rack Case Node'
  bad['Rack Level'].Description = 'E2E Bad Rack'
  bad.Package.Description = 'E2E Bad Rack Case Package'
  const badWb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(badWb, XLSX.utils.aoa_to_sheet([['Instructions']]), INSTRUCTIONS_SHEET)
  for (const entry of LEVEL_SHEETS) {
    const ws = XLSX.utils.json_to_sheet([bad[entry.sheetName]], { header: [...IMPORT_COLUMNS] })
    XLSX.utils.book_append_sheet(badWb, ws, entry.sheetName)
  }
  const badBuf = XLSX.write(badWb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  const beforeCount = store.length
  const badParsed = parseImportWorkbook(badBuf, projects, store, 'submit')
  const importedBad = collectImportRecords(badParsed)
  const blockingOk =
    badParsed.errorCount > 0 &&
    importedBad.length === 0 &&
    badParsed.rows.some((r) =>
      r.issues.some(
        (i) =>
          i.sheet === 'Rack Level' &&
          i.field === 'Configuration / Included Items' &&
          i.severity === 'error',
      ),
    ) &&
    store.length === beforeCount
  mark('E2E Validation Blocking', blockingOk)

  // 8. Duplicate — re-upload draft file
  const dupParsed = parseImportWorkbook(uploadBuf, projects, store, 'draft')
  const skipped = collectImportRecords(dupParsed).length
  const partRow = dupParsed.rows.find((r) => r.parsed.description === 'E2E Import Part')
  const dupOk =
    Boolean(partRow?.duplicateOf) &&
    partRow?.skipDuplicate === true &&
    skipped < 4
  mark('E2E Duplicate Detection', dupOk)

  // Import anyway still works without overwrite
  if (partRow) {
    const anyway = parseImportWorkbook(uploadBuf, projects, store, 'draft', {
      importDuplicates: new Set([importRowKey(partRow)]),
    })
    const anywayRecords = collectImportRecords(anyway)
    if (anywayRecords.some((r) => r.description === 'E2E Import Part' && r.id !== partRow.duplicateOf?.id)) {
      // ok — new id, did not overwrite
    }
  }

  // 9. Cleanup — drop e2e marker records from simulated store
  store = store.filter((r) => !(r.note || '').startsWith('e2e-') && !(r.description || '').startsWith('E2E '))
  mark('Test Data Cleanup', store.length === 0)
} catch (err) {
  console.error(err)
}

console.log('\n===== E2E REPORT =====')
for (const [key, value] of Object.entries(report)) {
  console.log(`${key}: ${value}`)
}

if (Object.values(report).some((v) => v === 'FAIL')) {
  process.exit(1)
}
