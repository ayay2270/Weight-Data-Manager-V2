import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Upload,
  XCircle,
} from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { useData } from '../hooks/useData'
import type { WeightRecord } from '../data/types'
import { loadExportContext } from '../utils/exportContext'
import { downloadBlob } from '../utils/helpers'
import {
  buildImportTemplateWorkbook,
  collectImportRecords,
  IMPORT_MAX_BYTES,
  IMPORT_TEMPLATE_FILENAME,
  importRowKey,
  parseImportWorkbook,
  type ImportMode,
  type PreparedImportRow,
} from '../utils/importWeightWorkbook'
import { exportCsv, exportViewCsv, exportViewWorkbook, exportWorkbook } from '../utils/io'

type ExportScope = 'all' | 'filtered' | 'project' | 'selected'
type ExportFormat = 'xlsx' | 'csv'
type MobilePane = 'export' | 'import'

export function ExportPage() {
  const { data, projects, appendRecords } = useData()
  const context = loadExportContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [searchParams] = useSearchParams()
  const requestedScope = searchParams.get('scope')
  const [scope, setScope] = useState<ExportScope>(
    requestedScope === 'filtered' || requestedScope === 'selected' || requestedScope === 'project' ? requestedScope : 'all',
  )
  const [projectCode, setProjectCode] = useState(projects[0]?.code || '')
  const [format, setFormat] = useState<ExportFormat>('xlsx')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mobilePane, setMobilePane] = useState<MobilePane>('export')

  const [importMode, setImportMode] = useState<ImportMode>('draft')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null)
  const [importAnyway, setImportAnyway] = useState<Set<string>>(new Set())
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    draft: number
    pending: number
    skipped: number
    warnings: number
  } | null>(null)

  const selectedCount = context.selectedIds.length
  const filteredCount = context.orderedFilteredRecordIds.length

  const parseResult = useMemo(() => {
    if (!fileBuffer) return null
    return parseImportWorkbook(fileBuffer, projects, data.records, importMode, {
      importDuplicates: importAnyway,
    })
  }, [fileBuffer, projects, data.records, importMode, importAnyway])

  const issueRows = useMemo(() => {
    if (!parseResult) return [] as PreparedImportRow[]
    return parseResult.rows.filter((row) => row.issues.length)
  }, [parseResult])

  const duplicateRows = useMemo(() => {
    if (!parseResult) return [] as PreparedImportRow[]
    return parseResult.rows.filter((row) => row.duplicateOf)
  }, [parseResult])

  const skippedDuplicates = useMemo(() => {
    if (!parseResult) return 0
    return parseResult.rows.filter((row) => row.skipDuplicate && row.duplicateOf).length
  }, [parseResult])

  function resolveRecords(): WeightRecord[] | null {
    if (scope === 'all') return data.records
    if (scope === 'filtered') {
      if (!filteredCount) {
        setError('No Current Filtered View is available. Open All records, apply filters, then return here.')
        return null
      }
      const byId = new Map(data.records.map((record) => [record.id, record]))
      return context.orderedFilteredRecordIds
        .map((id) => byId.get(id))
        .filter((record): record is WeightRecord => Boolean(record))
    }
    if (scope === 'project') {
      if (!projectCode) {
        setError('Please select a project.')
        return null
      }
      return data.records.filter((r) => r.projectCode === projectCode)
    }
    if (!selectedCount) {
      setError('No rows selected. Open All records and check the rows you want to export.')
      return null
    }
    const idSet = new Set(context.selectedIds)
    return data.records.filter((r) => idSet.has(r.id))
  }

  function runExport() {
    setMessage(null)
    setError(null)
    setImportResult(null)
    const subset = resolveRecords()
    if (!subset) return
    const stamp = new Date().toISOString().slice(0, 10)
    if (scope === 'filtered') {
      if (format === 'xlsx') {
        downloadBlob(
          new Blob([exportViewWorkbook(subset, context.visibleColumns)], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `weight-data-${stamp}.xlsx`,
        )
      } else {
        downloadBlob(
          new Blob([exportViewCsv(subset, context.visibleColumns)], { type: 'text/csv;charset=utf-8' }),
          `weight-data-${stamp}.csv`,
        )
      }
      setMessage(`Exported ${subset.length} record(s) from the current filtered view.`)
      return
    }
    if (format === 'xlsx') {
      const buffer = exportWorkbook(data, subset)
      downloadBlob(
        new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
        `weight-data-${stamp}.xlsx`,
      )
    } else {
      downloadBlob(new Blob([exportCsv(data, subset)], { type: 'text/csv;charset=utf-8' }), `weight-data-${stamp}.csv`)
    }
    setMessage(`Exported ${subset.length} record(s) as ${format === 'xlsx' ? 'Excel' : 'CSV'}.`)
  }

  function downloadTemplate() {
    const buffer = buildImportTemplateWorkbook()
    downloadBlob(
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      IMPORT_TEMPLATE_FILENAME,
    )
  }

  async function acceptFile(file: File | null | undefined) {
    setMessage(null)
    setError(null)
    setImportResult(null)
    setConfirmOpen(false)
    setImportAnyway(new Set())
    if (!file) return
    const lower = file.name.toLowerCase()
    if (!lower.endsWith('.xlsx')) {
      setError('Only .xlsx files are supported.')
      setFileName(null)
      setFileBuffer(null)
      return
    }
    if (file.size > IMPORT_MAX_BYTES) {
      setError('File exceeds the 10 MB limit.')
      setFileName(null)
      setFileBuffer(null)
      return
    }
    const buffer = await file.arrayBuffer()
    setFileName(file.name)
    setFileBuffer(buffer)
    setIssuesOpen(true)
  }

  function clearImportFile() {
    setFileName(null)
    setFileBuffer(null)
    setImportAnyway(new Set())
    setConfirmOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function toggleImportAnyway(key: string, enabled: boolean) {
    setImportAnyway((prev) => {
      const next = new Set(prev)
      if (enabled) next.add(key)
      else next.delete(key)
      return next
    })
  }

  function requestImport() {
    setError(null)
    setMessage(null)
    setImportResult(null)
    if (!parseResult) {
      setError('Upload an Excel file first.')
      return
    }
    if (parseResult.errorCount > 0) {
      setError('Fix critical errors before importing. No records were written.')
      setIssuesOpen(true)
      return
    }
    if (parseResult.readyCount === 0 && skippedDuplicates === parseResult.rows.filter((r) => r.duplicateOf).length) {
      // all duplicates skipped or empty
      if (collectImportRecords(parseResult).length === 0) {
        setError('Nothing to import. Adjust duplicate choices or upload a file with valid rows.')
        return
      }
    }
    const ready = collectImportRecords(parseResult)
    if (!ready.length) {
      setError('Nothing to import. Adjust duplicate choices or upload a file with valid rows.')
      return
    }
    setConfirmOpen(true)
  }

  function confirmImport() {
    if (!parseResult || parseResult.errorCount > 0) {
      setConfirmOpen(false)
      setError('Import blocked: critical errors present.')
      return
    }
    const records = collectImportRecords(parseResult)
    if (!records.length) {
      setConfirmOpen(false)
      setError('Nothing to import.')
      return
    }
    appendRecords(records)
    const draft = records.filter((r) => r.status === 'Draft').length
    const pending = records.filter((r) => r.status === 'Pending Review').length
    setImportResult({
      imported: records.length,
      draft,
      pending,
      skipped: skippedDuplicates,
      warnings: parseResult.warningCount,
    })
    setMessage(`Successfully imported ${records.length} record(s).`)
    setConfirmOpen(false)
    clearImportFile()
  }

  return (
    <>
      <PageHeader
        title="Import / Export"
        subtitle="Export weight records or import prepared Excel files using the official template."
      />
      <div className="content">
        {message ? <div className="alert success">{message}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}
        {importResult ? (
          <div className="alert success import-result-banner">
            <div>
              <strong>Successfully imported {importResult.imported} records.</strong>
              <div className="import-result-meta">
                Draft: {importResult.draft} · Pending Review: {importResult.pending} · Skipped duplicates:{' '}
                {importResult.skipped} · Warnings: {importResult.warnings}
              </div>
            </div>
            <Link className="button secondary" to="/records">
              Go to All records
            </Link>
          </div>
        ) : null}

        <div className="io-pane-tabs" role="tablist" aria-label="Import or Export">
          <button
            type="button"
            role="tab"
            className={mobilePane === 'export' ? 'active' : ''}
            aria-selected={mobilePane === 'export'}
            onClick={() => setMobilePane('export')}
          >
            Export
          </button>
          <button
            type="button"
            role="tab"
            className={mobilePane === 'import' ? 'active' : ''}
            aria-selected={mobilePane === 'import'}
            onClick={() => setMobilePane('import')}
          >
            Import
          </button>
        </div>

        <div className="io-layout">
          <div className={`panel export-card io-pane${mobilePane === 'export' ? ' io-pane-active' : ''}`}>
            <div className="panel-head export-card-head">
              <div className="section-title">
                <Download size={18} className="section-title-icon" />
                <div>
                  <h2>Export Weight Data</h2>
                  <p>LocalStorage database · {data.records.length} total records</p>
                </div>
              </div>
            </div>

            <div className="export-scope-block">
              <h3>Export Scope</h3>
              <label className="export-radio">
                <input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} />
                <span>
                  <strong>All Records</strong>
                  <small>Export every weight record in this browser.</small>
                </span>
              </label>
              <label className="export-radio">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'filtered'}
                  onChange={() => setScope('filtered')}
                />
                <span>
                  <strong>Current Filtered View{filteredCount ? ` (${filteredCount})` : ''}</strong>
                  <small>Uses the latest All records search, filters and saved view.</small>
                </span>
              </label>
              <label className="export-radio">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'project'}
                  onChange={() => setScope('project')}
                />
                <span>
                  <strong>Current Project</strong>
                  <small>Export records for one project only.</small>
                </span>
              </label>
              {scope === 'project' ? (
                <select
                  className="export-project-select"
                  value={projectCode}
                  onChange={(e) => setProjectCode(e.target.value)}
                  aria-label="Project to export"
                >
                  {!projects.length ? <option value="">No projects</option> : null}
                  {projects.map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.phase ? `${p.code} · ${p.phase}` : p.code}
                    </option>
                  ))}
                </select>
              ) : null}
              <label className={`export-radio${selectedCount ? '' : ' disabled'}`}>
                <input
                  type="radio"
                  name="scope"
                  checked={scope === 'selected'}
                  disabled={!selectedCount}
                  onChange={() => setScope('selected')}
                />
                <span>
                  <strong>Selected Records ({selectedCount})</strong>
                  <small>
                    {selectedCount
                      ? 'Export only rows checked in All records.'
                      : 'Select rows in All records first.'}
                  </small>
                </span>
              </label>
            </div>

            <div className="export-scope-block">
              <h3>Export Format</h3>
              <label className="export-radio">
                <input type="radio" name="format" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} />
                <span className="export-format-option">
                  <FileSpreadsheet size={18} />
                  <span>
                    <strong>Excel (.xlsx)</strong>
                    <small>Recommended · multiple sheets by level</small>
                  </span>
                </span>
              </label>
              <label className="export-radio">
                <input type="radio" name="format" checked={format === 'csv'} onChange={() => setFormat('csv')} />
                <span className="export-format-option">
                  <FileText size={18} />
                  <span>
                    <strong>CSV (.csv)</strong>
                    <small>Flat file · single sheet</small>
                  </span>
                </span>
              </label>
            </div>

            <div className="export-actions">
              <button type="button" className="button" onClick={runExport}>
                <Download size={16} /> Export
              </button>
            </div>
          </div>

          <div className={`panel export-card io-pane${mobilePane === 'import' ? ' io-pane-active' : ''}`}>
            <div className="panel-head export-card-head">
              <div className="section-title">
                <Upload size={18} className="section-title-icon" />
                <div>
                  <h2>Import Weight Data</h2>
                  <p>Upload a prepared Excel file to create weight records.</p>
                </div>
              </div>
            </div>

            <div className="export-scope-block">
              <h3>Upload File</h3>
              <div
                className={`import-dropzone${dragOver ? ' drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  void acceptFile(e.dataTransfer.files?.[0])
                }}
              >
                <FileUp size={28} className="import-dropzone-icon" />
                <p>
                  Drag and drop your Excel file here or{' '}
                  <button type="button" className="link-button" onClick={() => fileInputRef.current?.click()}>
                    Browse File
                  </button>
                </p>
                <small>Supports .xlsx files only (max 10 MB).</small>
                {fileName ? <div className="import-file-name">{fileName}</div> : null}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  hidden
                  onChange={(e) => void acceptFile(e.target.files?.[0])}
                />
              </div>
              {fileName ? (
                <button type="button" className="button secondary import-clear-btn" onClick={clearImportFile}>
                  Clear file
                </button>
              ) : null}
            </div>

            <div className="export-scope-block">
              <button type="button" className="button secondary import-template-btn" onClick={downloadTemplate}>
                <Download size={16} /> Download Excel Template
              </button>
              <p className="import-template-hint">Use the official template to avoid validation errors.</p>
            </div>

            <div className="export-scope-block">
              <h3>Import Mode</h3>
              <label className="export-radio">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'draft'}
                  onChange={() => setImportMode('draft')}
                />
                <span>
                  <strong>Import as Draft</strong>
                  <small>Save records as draft for review before submitting.</small>
                </span>
              </label>
              <label className="export-radio">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'submit'}
                  onChange={() => setImportMode('submit')}
                />
                <span>
                  <strong>Import &amp; Submit for Review</strong>
                  <small>Create records and submit for review immediately.</small>
                </span>
              </label>
            </div>

            <div className="import-summary-grid">
              <div className="import-summary-card">
                <h3>File Requirements</h3>
                <ul className="import-req-list">
                  <li>
                    <CheckCircle2 size={14} /> One sheet per level
                  </li>
                  <li>
                    <CheckCircle2 size={14} /> Supported sheets: Part Level / Node Level / Rack Level / Package
                  </li>
                  <li>
                    <CheckCircle2 size={14} /> Fields match Add Weight Record
                  </li>
                </ul>
              </div>
              <div className="import-summary-card">
                <h3>Import Summary</h3>
                {parseResult ? (
                  <ul className="import-summary-list">
                    <li>
                      <CheckCircle2 size={14} className="ok" /> {parseResult.sheetsFound.length} sheets found
                    </li>
                    <li>
                      <CheckCircle2 size={14} className="ok" /> {parseResult.readyCount} rows ready
                    </li>
                    <li>
                      <AlertTriangle size={14} className="warn" /> {parseResult.warningCount} warnings
                    </li>
                    <li>
                      <XCircle size={14} className={parseResult.errorCount ? 'err' : 'ok'} />{' '}
                      {parseResult.errorCount} critical errors
                    </li>
                  </ul>
                ) : (
                  <p className="import-summary-empty">Upload a file to see validation results.</p>
                )}
              </div>
            </div>

            {duplicateRows.length ? (
              <div className="export-scope-block">
                <h3>Possible Duplicates</h3>
                <p className="import-template-hint">Default is Skip. Choose Import Anyway per row if needed.</p>
                <div className="import-issue-table-wrap">
                  <table className="import-issue-table">
                    <thead>
                      <tr>
                        <th>Sheet</th>
                        <th>Row</th>
                        <th>Description</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicateRows.map((row) => {
                        const key = importRowKey(row)
                        const anyway = importAnyway.has(key)
                        return (
                          <tr key={key}>
                            <td>{row.parsed.sheet}</td>
                            <td>{row.parsed.row}</td>
                            <td>{row.parsed.description || '—'}</td>
                            <td>
                              <label className="import-dup-choice">
                                <input
                                  type="radio"
                                  name={`dup-${key}`}
                                  checked={!anyway}
                                  onChange={() => toggleImportAnyway(key, false)}
                                />
                                Skip
                              </label>
                              <label className="import-dup-choice">
                                <input
                                  type="radio"
                                  name={`dup-${key}`}
                                  checked={anyway}
                                  onChange={() => toggleImportAnyway(key, true)}
                                />
                                Import Anyway
                              </label>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {issueRows.length ? (
              <div className="export-scope-block">
                <button type="button" className="button secondary" onClick={() => setIssuesOpen((v) => !v)}>
                  {issuesOpen ? 'Hide' : 'Show'} row issues ({issueRows.reduce((n, r) => n + r.issues.length, 0)})
                </button>
                {issuesOpen ? (
                  <div className="import-issue-table-wrap">
                    <table className="import-issue-table">
                      <thead>
                        <tr>
                          <th>Sheet</th>
                          <th>Row</th>
                          <th>Field</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issueRows.flatMap((row) =>
                          row.issues.map((issue, idx) => (
                            <tr key={`${importRowKey(row)}-${idx}`} className={issue.severity}>
                              <td>{issue.sheet}</td>
                              <td>{issue.row}</td>
                              <td>{issue.field}</td>
                              <td>{issue.message}</td>
                            </tr>
                          )),
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}

            {confirmOpen && parseResult ? (
              <div className="import-confirm">
                <strong>Confirm import</strong>
                <ul>
                  <li>Ready to import: {collectImportRecords(parseResult).length}</li>
                  <li>Warnings: {parseResult.warningCount}</li>
                  <li>Duplicates skipped: {skippedDuplicates}</li>
                  <li>Mode: {importMode === 'draft' ? 'Draft' : 'Pending Review'}</li>
                </ul>
                <div className="export-actions">
                  <button type="button" className="button secondary" onClick={() => setConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button type="button" className="button" onClick={confirmImport}>
                    Confirm Import
                  </button>
                </div>
              </div>
            ) : null}

            <div className="export-actions">
              <button
                type="button"
                className="button"
                onClick={requestImport}
                disabled={!parseResult || parseResult.errorCount > 0 || confirmOpen}
              >
                <Upload size={16} /> Import
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
