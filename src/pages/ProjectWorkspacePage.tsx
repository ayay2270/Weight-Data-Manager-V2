import { useMemo, useState } from 'react'
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowRight, ChevronDown, ChevronRight, ChevronUp, Download, Pencil, Play, Scale, Search, Trash2, X } from 'lucide-react'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { RecordsTable } from '../components/RecordsTable'
import { ProgressRing, StatusBar, StatusDot } from '../components/ui'
import type { RecordStatus } from '../data/types'
import { LEVELS } from '../data/types'
import { useRecordActions } from '../hooks/recordActions'
import { useData } from '../hooks/useData'
import { summaryLine } from '../utils/summary'
import { canDeleteProject, formatWeightKg, nowIso } from '../utils/helpers'
import { PREF_KEYS, readPref, writePref } from '../utils/prefs'
import { EMPTY_FILTERS, filterRecords, sortRecords, STATUS_DISPLAY_ORDER, statusCounts, type SortDirection, type SortKey } from '../utils/recordFilters'
import { DEFAULT_COLUMNS, normalizeColumns, type ColumnKey } from '../utils/recordViews'

type Tab = 'records' | 'review' | 'about'

export function ProjectWorkspacePage() {
  const { projectId = '', tab: tabParam } = useParams()
  const tab: Tab = tabParam === 'review' || tabParam === 'about' ? tabParam : 'records'
  const { projects, records, upsertProject, deleteProject } = useData()
  const actions = useRecordActions()
  const navigate = useNavigate()
  const project = projects.find((p) => p.id === projectId)

  const [query, setQuery] = useState('')
  const [statuses, setStatuses] = useState<RecordStatus[]>([])
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null)
  const [descriptionWidth, setDescriptionWidth] = useState(() => readPref<number>(PREF_KEYS.descriptionWidth, 260))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState(false)
  const columns = useMemo<ColumnKey[]>(
    () => normalizeColumns(readPref(PREF_KEYS.visibleColumns, DEFAULT_COLUMNS)).filter((c) => c !== 'project' && c !== 'level'),
    [],
  )

  const projectRecords = useMemo(() => records.filter((r) => r.projectId === projectId), [records, projectId])
  const shown = useMemo(
    () => sortRecords(filterRecords(projectRecords, { ...EMPTY_FILTERS, query, statuses }), sortKey, sortDirection),
    [projectRecords, query, statuses, sortKey, sortDirection],
  )

  if (!project) {
    return (
      <div className="page">
        <div className="empty-state">
          <h3>Project not found</h3>
          <p>This project id is not in local data.</p>
          <Link className="button secondary" to="/">
            Back to projects
          </Link>
        </div>
      </div>
    )
  }

  const c = statusCounts(projectRecords)
  const pct = projectRecords.length ? c.Verified / projectRecords.length : 0

  function cycleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') setSortDirection('desc')
    else {
      setSortKey(null)
      setSortDirection(null)
    }
  }
  const tableProps = {
    columns,
    sortKey,
    sortDirection,
    onSort: cycleSort,
    descriptionWidth,
    onDescriptionWidth: (w: number, done: boolean) => {
      setDescriptionWidth(w)
      if (done) writePref(PREF_KEYS.descriptionWidth, w)
    },
    selectedIds,
    onToggleSelect: (id: string) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    onToggleAll: (ids: string[], select: boolean) =>
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => (select ? next.add(id) : next.delete(id)))
        return next
      }),
  }

  const pending = sortRecords(projectRecords.filter((r) => r.status === 'Pending Review'), 'measuredDate', 'asc')
  const returned = projectRecords.filter((r) => r.status === 'Need Recheck')
  const pendingSelected = [...selectedIds].filter((id) => pending.some((r) => r.id === id))

  return (
    <div className="page">
      <section className="project-hero">
        <div>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/">Projects</Link>
            <ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">{project.code}</span>
          </nav>
          <h1>{project.code}</h1>
          <div className="tags">
            <span className="tag">{project.phase || 'No phase'}</span>
            <span className={`tag${project.status === 'Archived' ? ' muted-tag' : ''}`}>{project.status}</span>
            {project.notes ? <span className="muted">{project.notes}</span> : null}
          </div>
        </div>
        <div className="hero-stats">
          <ProgressRing value={pct} />
          <div>
            <b>{projectRecords.length}</b>
            <span>records</span>
          </div>
          <div>
            <b className="tone-pending-text">{c['Pending Review']}</b>
            <span>pending</span>
          </div>
          <div>
            <b className="tone-recheck-text">{c['Need Recheck']}</b>
            <span>recheck</span>
          </div>
          {project.status === 'Active' ? (
            <Link className="button" to={`/measure?project=${project.id}`}>
              <Scale size={16} /> Measure in {project.code}
            </Link>
          ) : null}
        </div>
      </section>

      <nav className="tabs" aria-label="Project sections">
        <NavLink end to={`/projects/${project.id}`} className={() => `tab${tab === 'records' ? ' active' : ''}`}>
          Records
        </NavLink>
        <NavLink to={`/projects/${project.id}/review`} className={() => `tab${tab === 'review' ? ' active' : ''}`}>
          Review · {c['Pending Review']}
        </NavLink>
        <NavLink to={`/projects/${project.id}/about`} className={() => `tab${tab === 'about' ? ' active' : ''}`}>
          About
        </NavLink>
      </nav>

      {tab === 'records' ? (
        <>
          <div className="toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Search this project</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${project.code}… or weight>1kg`} />
              {query ? (
                <button type="button" className="icon-button tiny" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              ) : null}
            </label>
            <Link className="button secondary" to={`/records?project=${encodeURIComponent(project.code)}`}>
              Open in All records <ArrowRight size={14} />
            </Link>
          </div>
          <div className="status-chips" role="group" aria-label="Status filter">
            <button type="button" className={`chip${statuses.length ? '' : ' active'}`} aria-pressed={!statuses.length} onClick={() => setStatuses([])}>
              All statuses <span className="chip-count">{projectRecords.length}</span>
            </button>
            {STATUS_DISPLAY_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                className={`chip${statuses.includes(s) ? ' active' : ''}`}
                aria-pressed={statuses.includes(s)}
                onClick={() => setStatuses(statuses.includes(s) ? statuses.filter((x) => x !== s) : [...statuses, s])}
              >
                <StatusDot status={s} /> {s} <span className="chip-count">{c[s]}</span>
              </button>
            ))}
          </div>
          {LEVELS.map((level) => {
            const rows = shown.filter((r) => r.level === level)
            if (!rows.length) return null
            const open = !collapsed[level]
            return (
              <section key={level} className={`group-card${open ? ' open' : ''}`}>
                <div className="group-head">
                  <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setCollapsed({ ...collapsed, [level]: open })}>
                    <span className="group-title serif">{level}</span>
                    <span className="group-summary">{summaryLine(rows)}</span>
                    <StatusBar records={rows} />
                    <span className="group-chevron">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                  </button>
                </div>
                {open ? <RecordsTable records={rows} caption={`${project.code} ${level} records`} {...tableProps} /> : null}
              </section>
            )
          })}
          {!shown.length ? (
            <div className="empty-state">
              <h3>{projectRecords.length ? 'No records match' : 'No records yet'}</h3>
              <p>{projectRecords.length ? 'Clear the search or status filter.' : 'Start a measurement session to add the first records.'}</p>
              {projectRecords.length ? (
                <button type="button" className="button secondary" onClick={() => { setQuery(''); setStatuses([]) }}>
                  Clear filters
                </button>
              ) : project.status === 'Active' ? (
                <Link className="button" to={`/measure?project=${project.id}`}>
                  <Scale size={16} /> Start measuring
                </Link>
              ) : null}
            </div>
          ) : null}
          {selectedIds.size ? (
            <div className="selection-bar" role="region" aria-label="Selection">
              <strong>{selectedIds.size} selected</strong>
              <span className="grow" />
              {pendingSelected.length ? (
                <button type="button" className="button small light" onClick={() => navigate(`/review?ids=${pendingSelected.join(',')}`)}>
                  Review {pendingSelected.length} pending
                </button>
              ) : null}
              <button type="button" className="button small light" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === 'review' ? (
        <div className="two-col">
          <section className="panel">
            <h2>Waiting for review</h2>
            <p className="muted">{pending.length} record{pending.length === 1 ? '' : 's'}, oldest measurement first.</p>
            {pending.length ? (
              <Link className="button" to={`/review?project=${project.id}`}>
                <Play size={15} /> Start review session
              </Link>
            ) : null}
            <ol className="plain-list">
              {pending.map((r) => (
                <li key={r.id}>
                  <button type="button" className="desc-link" onClick={() => actions.view(r)}>
                    {r.description || 'Untitled'}
                  </button>
                  <span className="muted">
                    {r.level} · {r.measuredBy || '—'} · {r.measuredDate || '—'}
                  </span>
                  <b>{formatWeightKg(r)}</b>
                </li>
              ))}
              {!pending.length ? <li className="muted">Nothing waiting for review.</li> : null}
            </ol>
          </section>
          <section className="panel">
            <h2>Returned to testers</h2>
            <p className="muted">Need Recheck — the tester updates the measurement and resubmits it.</p>
            <ol className="plain-list">
              {returned.map((r) => (
                <li key={r.id}>
                  <button type="button" className="desc-link" onClick={() => actions.view(r)}>
                    {r.description || 'Untitled'}
                  </button>
                  <span className="muted">
                    {r.reviewedBy || '—'}: {r.reviewComment || 'No comment'}
                  </span>
                  <button type="button" className="button secondary small" onClick={() => actions.edit(r)}>
                    Update
                  </button>
                </li>
              ))}
              {!returned.length ? <li className="muted">None.</li> : null}
            </ol>
          </section>
        </div>
      ) : null}

      {tab === 'about' ? (
        <div className="two-col">
          <section className="panel">
            <h2>Project details</h2>
            <dl className="drawer-dl">
              <div className="drawer-row">
                <dt>Code</dt>
                <dd>{project.code}</dd>
              </div>
              <div className="drawer-row">
                <dt>Phase</dt>
                <dd>{project.phase || '—'}</dd>
              </div>
              <div className="drawer-row">
                <dt>Status</dt>
                <dd>{project.status}</dd>
              </div>
              <div className="drawer-row">
                <dt>Notes</dt>
                <dd>{project.notes || '—'}</dd>
              </div>
              <div className="drawer-row">
                <dt>Created</dt>
                <dd>{(project.createdAt || '').slice(0, 10) || '—'}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button type="button" className="button secondary" onClick={() => setEditing(true)}>
                <Pencil size={15} /> Edit project
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => upsertProject({ ...project, status: project.status === 'Active' ? 'Archived' : 'Active', updatedAt: nowIso() })}
              >
                <Archive size={15} /> {project.status === 'Active' ? 'Archive' : 'Restore'}
              </button>
              {canDeleteProject(project.id, records) ? (
                <button
                  type="button"
                  className="button ghost danger-text"
                  onClick={() => {
                    if (!confirm(`Delete project ${project.code}? It has no records.`)) return
                    deleteProject(project.id)
                    navigate('/')
                  }}
                >
                  <Trash2 size={15} /> Delete
                </button>
              ) : null}
            </div>
            <p className="muted small-text">Projects with records can be archived but not deleted. Archived projects are hidden from new measurements.</p>
          </section>
          <section className="panel">
            <h2>By level</h2>
            <table className="records-table compact">
              <thead>
                <tr>
                  <th>Level</th>
                  <th className="num">Records</th>
                  <th className="num">Verified</th>
                  <th>Status mix</th>
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((l) => {
                  const rs = projectRecords.filter((r) => r.level === l)
                  return (
                    <tr key={l}>
                      <td>{l}</td>
                      <td className="num">{rs.length}</td>
                      <td className="num">{rs.filter((r) => r.status === 'Verified').length}</td>
                      <td>
                        <StatusBar records={rs} width={140} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <Link className="link-button" to="/export">
              <Download size={14} /> Export this project from Import / Export
            </Link>
          </section>
        </div>
      ) : null}

      {editing ? <ProjectFormModal project={project} onClose={() => setEditing(false)} /> : null}
    </div>
  )
}
