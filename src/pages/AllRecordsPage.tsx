import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Columns3,
  Download,
  RefreshCcw,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { RecordsTable } from '../components/RecordsTable'
import { StatusBar, StatusDot } from '../components/ui'
import type { DataSource, Level, RecordStatus } from '../data/types'
import { DATA_SOURCES, LEVELS, RECORD_STATUSES } from '../data/types'
import { useData } from '../hooks/useData'
import { summaryLine } from '../utils/summary'
import { saveExportContext } from '../utils/exportContext'
import { PREF_KEYS, readPref, writePref } from '../utils/prefs'
import { projectFacetOptions } from '../utils/projectFacet'
import {
  activeFilterCount,
  EMPTY_FILTERS,
  facetCounts,
  filterRecords,
  groupRecords,
  sortRecords,
  STATUS_DISPLAY_ORDER,
  toggleFacet,
  type FacetKey,
  type GroupBy,
  type RecordFilterState,
  type SortDirection,
  type SortKey,
} from '../utils/recordFilters'
import {
  COLUMN_OPTIONS,
  DEFAULT_COLUMNS,
  loadRecordViews,
  normalizeColumns,
  saveRecordViews,
  type ColumnKey,
  type RecordView,
} from '../utils/recordViews'

const GROUP_ROW_LIMIT = 10
const FLAT_PAGE_SIZE = 25
const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'project', label: 'Project' },
  { value: 'level', label: 'Level' },
  { value: 'status', label: 'Status' },
  { value: 'phase', label: 'Build / Phase' },
  { value: 'none', label: 'No grouping' },
]

function FacetSection({
  title,
  open,
  onToggle,
  children,
  id,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  id: string
}) {
  return (
    <section className="facet">
      <button type="button" className="facet-head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {title}
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open ? (
        <div className="facet-body" id={id}>
          {children}
        </div>
      ) : null}
    </section>
  )
}

function FacetOption({
  label,
  count,
  checked,
  onChange,
  dot,
}: {
  label: string
  count: number
  checked: boolean
  onChange: () => void
  dot?: RecordStatus
}) {
  return (
    <label className={`facet-option${checked ? ' checked' : ''}${count === 0 && !checked ? ' is-empty' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {dot ? <StatusDot status={dot} /> : null}
      <span className="facet-label">{label}</span>
      <span className="facet-count">{count}</span>
    </label>
  )
}

export function AllRecordsPage() {
  const { projects, records } = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const searchRef = useRef<HTMLInputElement>(null)

  const [filters, setFilters] = useState<RecordFilterState>(EMPTY_FILTERS)
  const [groupBy, setGroupBy] = useState<GroupBy>(() => readPref<GroupBy>(PREF_KEYS.groupBy, 'project'))
  const [columns, setColumns] = useState<ColumnKey[]>(() => normalizeColumns(readPref(PREF_KEYS.visibleColumns, DEFAULT_COLUMNS)))
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection | null>(null)
  const [descriptionWidth, setDescriptionWidth] = useState(() => readPref<number>(PREF_KEYS.descriptionWidth, 260))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Record<string, boolean> | null>(() => readPref(PREF_KEYS.openGroups, null))
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [pinned, setPinned] = useState<string[]>(() => readPref<string[]>(PREF_KEYS.pinnedProjects, []))
  const [projectSearch, setProjectSearch] = useState('')
  const [facetOpen, setFacetOpen] = useState<Record<string, boolean>>({ status: true, project: true, level: true, phase: true, source: false, by: false })
  const [showMore, setShowMore] = useState<Record<string, boolean>>({})
  const [views, setViews] = useState<RecordView[]>(loadRecordViews)
  const [viewId, setViewId] = useState('all')
  const [modal, setModal] = useState<'save-view' | 'manage-views' | 'all-projects' | null>(null)
  const [viewName, setViewName] = useState('')
  const [allProjectsQuery, setAllProjectsQuery] = useState('')
  const [fieldsOpen, setFieldsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [page, setPage] = useState(1)
  const appliedInitial = useRef(false)

  /* -------- initial state: URL params (links from other pages) or the default saved view -------- */
  useEffect(() => {
    const project = params.get('project')
    const status = params.get('status')
    if (project || status) {
      setFilters({
        ...EMPTY_FILTERS,
        projectCodes: project ? [project] : [],
        statuses: status && RECORD_STATUSES.includes(status as RecordStatus) ? [status as RecordStatus] : [],
      })
      if (project) setOpenGroups((prev) => ({ ...(prev || {}), [`project:${projects.find((p) => p.code === project)?.id}`]: true }))
      setParams({}, { replace: true })
      appliedInitial.current = true
      return
    }
    if (appliedInitial.current) return
    appliedInitial.current = true
    const def = views.find((v) => v.isDefault)
    if (def) applyView(def.id)
    // Run when URL params change; applyView is stable enough for this one-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  /* -------- derived data -------- */
  const filtered = useMemo(() => filterRecords(records, filters), [records, filters])
  const sorted = useMemo(() => sortRecords(filtered, sortKey, sortDirection), [filtered, sortKey, sortDirection])
  const groups = useMemo(() => groupRecords(sorted, groupBy, projects), [sorted, groupBy, projects])
  const displayColumns = useMemo<ColumnKey[]>(() => {
    if (groupBy === 'project') return columns.filter((c) => c !== 'project')
    return columns.includes('project') ? columns : ['description', 'project', ...columns.filter((c) => c !== 'description')]
  }, [columns, groupBy])
  const counts = useMemo(() => {
    const keys: FacetKey[] = ['statuses', 'projectCodes', 'levels', 'phases', 'sources', 'measuredBy']
    return Object.fromEntries(keys.map((k) => [k, facetCounts(records, filters, k)])) as Record<FacetKey, Map<string, number>>
  }, [records, filters])
  const phaseValues = useMemo(() => [...new Set(records.map((r) => r.buildPhase || ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1)), [records])
  const peopleValues = useMemo(() => [...new Set(records.map((r) => r.measuredBy || ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1)), [records])
  const projectOptions = useMemo(
    () => projectFacetOptions(projects, records, { pinned, selectedCodes: filters.projectCodes, search: projectSearch }),
    [projects, records, pinned, filters.projectCodes, projectSearch],
  )
  const projectsInResults = new Set(filtered.map((r) => r.projectId)).size
  const orderedIds = useMemo(() => groups.flatMap((g) => g.records.map((r) => r.id)), [groups])
  const pendingSelected = [...selectedIds].filter((id) => records.find((r) => r.id === id)?.status === 'Pending Review')

  /* Keep the Import / Export "Current filtered view" and "Selected" scopes in sync (same mechanism as the original). */
  useEffect(() => {
    const exportColumns = ['project', ...displayColumns.filter((c) => c !== 'project')]
    saveExportContext(orderedIds, exportColumns, [...selectedIds].filter((id) => orderedIds.includes(id)))
  }, [orderedIds, displayColumns, selectedIds])

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => records.some((r) => r.id === id)))
      return next.size === prev.size ? prev : next
    })
  }, [records])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body
      if (e.key === '/' && !t.closest('input, textarea, select')) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /* -------- helpers -------- */
  function update(next: RecordFilterState) {
    setFilters(next)
    setViewId('custom')
    setPage(1)
  }
  function toggle<K extends FacetKey>(key: K, value: RecordFilterState[K][number]) {
    update(toggleFacet(filters, key, value))
  }
  function setSingle(key: 'sources' | 'phases', value: string) {
    update({ ...filters, [key]: value ? [value] : [] })
  }
  function isOpen(key: string, index: number) {
    if (openGroups && key in openGroups) return openGroups[key]
    return index === 0
  }
  function setGroupOpen(key: string, index: number, open: boolean) {
    const next = { ...(openGroups || {}) }
    if (!openGroups) groups.forEach((g, i) => (next[g.key] = i === 0))
    next[key] = open
    void index
    setOpenGroups(next)
    writePref(PREF_KEYS.openGroups, next)
  }
  function setAllGroups(open: boolean) {
    const next = Object.fromEntries(groups.map((g) => [g.key, open]))
    setOpenGroups({ ...(openGroups || {}), ...next })
    writePref(PREF_KEYS.openGroups, { ...(openGroups || {}), ...next })
  }
  function cycleSort(key: SortKey) {
    setViewId('custom')
    if (sortKey !== key) {
      setSortKey(key)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') setSortDirection('desc')
    else {
      setSortKey(null)
      setSortDirection(null)
    }
  }
  function updateColumns(next: ColumnKey[]) {
    const normalized = normalizeColumns(next)
    setColumns(normalized)
    writePref(PREF_KEYS.visibleColumns, normalized)
  }
  function changeGroup(next: GroupBy) {
    setGroupBy(next)
    writePref(PREF_KEYS.groupBy, next)
    setPage(1)
    setViewId('custom')
  }
  function togglePin(id: string) {
    const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id]
    setPinned(next)
    writePref(PREF_KEYS.pinnedProjects, next)
  }
  function resetAll() {
    setFilters(EMPTY_FILTERS)
    setSortKey(null)
    setSortDirection(null)
    setViewId('all')
    setPage(1)
  }
  function applyView(id: string) {
    setViewId(id)
    setPage(1)
    if (id === 'all') {
      resetAll()
      return
    }
    const view = views.find((v) => v.id === id)
    if (!view) return
    setFilters({ ...EMPTY_FILTERS, ...view.state.filters })
    setGroupBy(view.state.groupBy)
    updateColumns(view.state.visibleColumns)
    setSortKey(view.state.sortKey)
    setSortDirection(view.state.sortDirection)
  }
  function persistViews(next: RecordView[]) {
    setViews(next)
    saveRecordViews(next)
  }
  function saveView() {
    const name = viewName.trim()
    if (!name) return
    const view: RecordView = { id: crypto.randomUUID(), name, state: { filters, groupBy, visibleColumns: columns, sortKey, sortDirection } }
    persistViews([...views, view])
    setViewId(view.id)
    setViewName('')
    setModal(null)
  }
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll(ids: string[], select: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (select ? next.add(id) : next.delete(id)))
      return next
    })
  }
  const tableProps = {
    columns: displayColumns,
    sortKey,
    sortDirection,
    onSort: cycleSort,
    descriptionWidth,
    onDescriptionWidth: (w: number, done: boolean) => {
      setDescriptionWidth(w)
      if (done) writePref(PREF_KEYS.descriptionWidth, w)
    },
    selectedIds,
    onToggleSelect: toggleSelect,
    onToggleAll: toggleAll,
  }

  /* -------- sidebar -------- */
  const limitList = (key: string, values: string[], limit: number) => (showMore[key] || values.length <= limit + 1 ? values : values.slice(0, limit))
  const renderSidebar = (prefix: string) => (
    <aside className="facets" aria-label="Filters">
      <div className="facets-head">
        <h2>Filters</h2>
        <button type="button" className="link-button" onClick={resetAll} disabled={!activeFilterCount(filters)}>
          <RefreshCcw size={13} /> Reset all
        </button>
      </div>

      <FacetSection title="Status" id={`${prefix}-status`} open={facetOpen.status} onToggle={() => setFacetOpen({ ...facetOpen, status: !facetOpen.status })}>
        <button type="button" className={`facet-all${filters.statuses.length ? '' : ' checked'}`} onClick={() => update({ ...filters, statuses: [] })}>
          <span>All statuses</span>
          <span className="facet-count">{[...counts.statuses.values()].reduce((a, b) => a + b, 0)}</span>
        </button>
        {STATUS_DISPLAY_ORDER.map((s) => (
          <FacetOption key={s} label={s} dot={s} count={counts.statuses.get(s) || 0} checked={filters.statuses.includes(s)} onChange={() => toggle('statuses', s)} />
        ))}
      </FacetSection>

      <FacetSection title="Project" id={`${prefix}-project`} open={facetOpen.project} onToggle={() => setFacetOpen({ ...facetOpen, project: !facetOpen.project })}>
        <label className="facet-search">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Search projects</span>
          <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search projects…" />
          {projectSearch ? (
            <button type="button" className="icon-button tiny" aria-label="Clear project search" onClick={() => setProjectSearch('')}>
              <X size={13} />
            </button>
          ) : null}
        </label>
        <button type="button" className={`facet-all${filters.projectCodes.length ? '' : ' checked'}`} onClick={() => update({ ...filters, projectCodes: [] })}>
          <span>All projects</span>
          <span className="facet-count">{projects.length}</span>
        </button>
        {!projectSearch ? <p className="facet-note">Pinned · selected · recently active</p> : null}
        {projectOptions.items.map(({ project, pinned: isPinned }) => (
          <div key={project.id} className={`facet-option project-option${filters.projectCodes.includes(project.code) ? ' checked' : ''}`}>
            <label>
              <input type="checkbox" checked={filters.projectCodes.includes(project.code)} onChange={() => toggle('projectCodes', project.code)} />
              <span className="facet-label">
                {project.code}
                {project.status === 'Archived' ? <em> archived</em> : null}
              </span>
              <span className="facet-count">{counts.projectCodes.get(project.code) || 0}</span>
            </label>
            <button
              type="button"
              className={`pin${isPinned ? ' on' : ''}`}
              aria-pressed={isPinned}
              aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${project.code}`}
              title={isPinned ? 'Unpin' : 'Pin to top'}
              onClick={() => togglePin(project.id)}
            >
              <Star size={14} />
            </button>
          </div>
        ))}
        {!projectOptions.items.length ? <p className="facet-note">No projects match “{projectSearch}”.</p> : null}
        <button type="button" className="facet-more" onClick={() => setModal('all-projects')}>
          View all projects{projectOptions.hiddenCount ? ` (${projects.length})` : ''} <ArrowRight size={13} />
        </button>
      </FacetSection>

      <FacetSection title="Level" id={`${prefix}-level`} open={facetOpen.level} onToggle={() => setFacetOpen({ ...facetOpen, level: !facetOpen.level })}>
        {LEVELS.map((l) => (
          <FacetOption key={l} label={l} count={counts.levels.get(l) || 0} checked={filters.levels.includes(l)} onChange={() => toggle('levels', l as Level)} />
        ))}
      </FacetSection>

      <FacetSection title="Build / Phase" id={`${prefix}-phase`} open={facetOpen.phase} onToggle={() => setFacetOpen({ ...facetOpen, phase: !facetOpen.phase })}>
        {limitList('phase', phaseValues, 6).map((p) => (
          <FacetOption key={p || 'none'} label={p || 'None'} count={counts.phases.get(p) || 0} checked={filters.phases.includes(p)} onChange={() => toggle('phases', p)} />
        ))}
        {phaseValues.length > 7 ? (
          <button type="button" className="facet-more" onClick={() => setShowMore({ ...showMore, phase: !showMore.phase })}>
            {showMore.phase ? 'Show fewer' : `Show all ${phaseValues.length}`}
          </button>
        ) : null}
      </FacetSection>

      <FacetSection title="Source" id={`${prefix}-source`} open={facetOpen.source} onToggle={() => setFacetOpen({ ...facetOpen, source: !facetOpen.source })}>
        {DATA_SOURCES.map((s) => (
          <FacetOption key={s} label={s} count={counts.sources.get(s) || 0} checked={filters.sources.includes(s)} onChange={() => toggle('sources', s as DataSource)} />
        ))}
      </FacetSection>

      <FacetSection title="Measured By" id={`${prefix}-by`} open={facetOpen.by} onToggle={() => setFacetOpen({ ...facetOpen, by: !facetOpen.by })}>
        {limitList('by', peopleValues, 6).map((p) => (
          <FacetOption key={p || 'none'} label={p || 'Not recorded'} count={counts.measuredBy.get(p) || 0} checked={filters.measuredBy.includes(p)} onChange={() => toggle('measuredBy', p)} />
        ))}
        {peopleValues.length > 7 ? (
          <button type="button" className="facet-more" onClick={() => setShowMore({ ...showMore, by: !showMore.by })}>
            {showMore.by ? 'Show fewer' : `Show all ${peopleValues.length}`}
          </button>
        ) : null}
      </FacetSection>
    </aside>
  )

  /* -------- active filter chips -------- */
  const chips: { label: string; clear: () => void }[] = [
    ...filters.projectCodes.map((v) => ({ label: `Project: ${v}`, clear: () => toggle('projectCodes', v) })),
    ...filters.levels.map((v) => ({ label: `Level: ${v}`, clear: () => toggle('levels', v) })),
    ...filters.phases.map((v) => ({ label: `Phase: ${v || 'None'}`, clear: () => toggle('phases', v) })),
    ...filters.sources.map((v) => ({ label: `Source: ${v}`, clear: () => toggle('sources', v) })),
    ...filters.measuredBy.map((v) => ({ label: `Measured by: ${v || 'Not recorded'}`, clear: () => toggle('measuredBy', v) })),
    ...(filters.query.trim() ? [{ label: `Search: “${filters.query.trim()}”`, clear: () => update({ ...filters, query: '' }) }] : []),
  ]

  const flatPages = Math.max(1, Math.ceil(sorted.length / FLAT_PAGE_SIZE))
  const flatPage = Math.min(page, flatPages)
  const allProjectsList = projects.filter((p) => [p.code, p.phase, p.notes].some((v) => (v || '').toLowerCase().includes(allProjectsQuery.trim().toLowerCase())))

  return (
    <div className="records-layout">
      {renderSidebar('facet')}
      {drawerOpen ? (
        <div className="facet-drawer-backdrop" onClick={() => setDrawerOpen(false)} role="presentation">
          <div className="facet-drawer" role="dialog" aria-modal="true" aria-label="Filters" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-button facet-drawer-close" aria-label="Close filters" onClick={() => setDrawerOpen(false)}>
              <X size={18} />
            </button>
            {renderSidebar('drawer')}
          </div>
        </div>
      ) : null}

      <div className="records-main">
        <header className="page-head">
          <div>
            <h1>All records</h1>
            <p>
              {filtered.length} of {records.length} weight records across {projectsInResults} project{projectsInResults === 1 ? '' : 's'}.
            </p>
          </div>
          <button type="button" className="button secondary" onClick={() => navigate('/export?scope=filtered')} title="Export the records shown here (current filters, order and fields)">
            <Download size={15} /> Export
          </button>
        </header>

        <div className="toolbar" role="search">
          <button type="button" className="button secondary filters-toggle" onClick={() => setDrawerOpen(true)}>
            <SlidersHorizontal size={15} /> Filters{activeFilterCount(filters) ? ` (${activeFilterCount(filters)})` : ''}
          </button>
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search records</span>
            <input
              ref={searchRef}
              value={filters.query}
              onChange={(e) => update({ ...filters, query: e.target.value })}
              placeholder="Search description, PN, person… or level:rack weight>1kg"
            />
            {filters.query ? (
              <button type="button" className="icon-button tiny" aria-label="Clear search" onClick={() => update({ ...filters, query: '' })}>
                <X size={14} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </label>
          <label className="select-field">
            <span className="sr-only">Source</span>
            <select value={filters.sources.length === 1 ? filters.sources[0] : filters.sources.length ? '__multi' : ''} onChange={(e) => setSingle('sources', e.target.value)}>
              <option value="">Any source</option>
              {filters.sources.length > 1 ? <option value="__multi" disabled>{filters.sources.length} sources</option> : null}
              {DATA_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span className="sr-only">Build / Phase</span>
            <select value={filters.phases.length === 1 ? filters.phases[0] : filters.phases.length ? '__multi' : '__any'} onChange={(e) => (e.target.value === '__any' ? update({ ...filters, phases: [] }) : setSingle('phases', e.target.value))}>
              <option value="__any">Any phase</option>
              {filters.phases.length > 1 ? <option value="__multi" disabled>{filters.phases.length} phases</option> : null}
              {phaseValues.map((p) => (
                <option key={p || 'none'} value={p}>
                  {p || 'None'}
                </option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span className="sr-only">Group by</span>
            <select value={groupBy} onChange={(e) => changeGroup(e.target.value as GroupBy)}>
              {GROUP_OPTIONS.map((g) => (
                <option key={g.value} value={g.value}>
                  Group: {g.label}
                </option>
              ))}
            </select>
          </label>
          <div className="popover-anchor">
            <button type="button" className="button secondary" aria-expanded={fieldsOpen} onClick={() => setFieldsOpen((v) => !v)}>
              <Columns3 size={15} /> Fields
            </button>
            {fieldsOpen ? (
              <div className="popover fields-popover" role="dialog" aria-label="Visible fields">
                <div className="popover-head">
                  <strong>Visible fields</strong>
                  <button type="button" className="link-button" onClick={() => updateColumns(DEFAULT_COLUMNS)}>
                    Reset
                  </button>
                </div>
                <div className="fields-grid">
                  {COLUMN_OPTIONS.map((c) => {
                    const lockedByGroup = c.key === 'project' && groupBy === 'project'
                    return (
                      <label key={c.key} className={c.locked || lockedByGroup ? 'locked' : undefined}>
                        <input
                          type="checkbox"
                          checked={c.locked || columns.includes(c.key) || (c.key === 'project' && groupBy !== 'project')}
                          disabled={c.locked || lockedByGroup || (c.key === 'project' && groupBy !== 'project')}
                          onChange={() => updateColumns(columns.includes(c.key) ? columns.filter((x) => x !== c.key) : [...columns, c.key])}
                        />
                        {c.label}
                        {lockedByGroup ? <small> (in group header)</small> : null}
                      </label>
                    )
                  })}
                </div>
                <div className="popover-foot">
                  <button type="button" className="button secondary small" onClick={() => updateColumns(COLUMN_OPTIONS.map((c) => c.key))}>
                    Show all
                  </button>
                  <button type="button" className="button small" onClick={() => setFieldsOpen(false)}>
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <label className="select-field views-select">
            <span className="sr-only">Saved view</span>
            <select
              value={viewId}
              onChange={(e) => {
                if (e.target.value === '__manage') setModal('manage-views')
                else applyView(e.target.value)
              }}
            >
              <option value="all">View: All records</option>
              {viewId === 'custom' ? <option value="custom">View: Unsaved changes</option> : null}
              {views.map((v) => (
                <option key={v.id} value={v.id}>
                  View: {v.name}
                  {v.isDefault ? ' (default)' : ''}
                </option>
              ))}
              <option value="__manage">Manage views…</option>
            </select>
          </label>
          <button type="button" className="button secondary" onClick={() => setModal('save-view')}>
            <Bookmark size={15} /> Save view
          </button>
        </div>

        <div className="status-chips" role="group" aria-label="Status quick filter">
          <button type="button" className={`chip${filters.statuses.length ? '' : ' active'}`} aria-pressed={!filters.statuses.length} onClick={() => update({ ...filters, statuses: [] })}>
            All statuses <span className="chip-count">{[...counts.statuses.values()].reduce((a, b) => a + b, 0)}</span>
          </button>
          {STATUS_DISPLAY_ORDER.map((s) => (
            <button key={s} type="button" className={`chip${filters.statuses.includes(s) ? ' active' : ''}`} aria-pressed={filters.statuses.includes(s)} onClick={() => toggle('statuses', s)}>
              <StatusDot status={s} /> {s} <span className="chip-count">{counts.statuses.get(s) || 0}</span>
            </button>
          ))}
        </div>

        {chips.length ? (
          <div className="active-filters">
            {chips.map((c) => (
              <span key={c.label} className="filter-chip">
                {c.label}
                <button type="button" aria-label={`Remove ${c.label}`} onClick={c.clear}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="link-button" onClick={resetAll}>
              Clear all
            </button>
          </div>
        ) : null}

        {groupBy !== 'none' && groups.length > 1 ? (
          <div className="group-tools">
            <span className="muted">
              {groups.length} {GROUP_OPTIONS.find((g) => g.value === groupBy)?.label.toLowerCase()} groups
            </span>
            <button type="button" className="link-button" onClick={() => setAllGroups(true)}>
              Expand all
            </button>
            <button type="button" className="link-button" onClick={() => setAllGroups(false)}>
              Collapse all
            </button>
          </div>
        ) : null}

        {!filtered.length ? (
          <div className="empty-state">
            <h3>No records match</h3>
            <p>Try removing a filter, searching part of a PN, or clearing the search.</p>
            <button type="button" className="button secondary" onClick={resetAll}>
              Reset all filters
            </button>
          </div>
        ) : groupBy === 'none' ? (
          <section className="group-card open">
            <RecordsTable records={sorted.slice((flatPage - 1) * FLAT_PAGE_SIZE, flatPage * FLAT_PAGE_SIZE)} caption="All records" {...tableProps} />
            <div className="group-foot">
              <span className="muted">
                Showing {(flatPage - 1) * FLAT_PAGE_SIZE + 1}–{Math.min(flatPage * FLAT_PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <span className="pager">
                <button type="button" className="icon-button" aria-label="Previous page" disabled={flatPage === 1} onClick={() => setPage(flatPage - 1)}>
                  <ChevronLeft size={16} />
                </button>
                {flatPage} / {flatPages}
                <button type="button" className="icon-button" aria-label="Next page" disabled={flatPage === flatPages} onClick={() => setPage(flatPage + 1)}>
                  <ChevronRight size={16} />
                </button>
              </span>
            </div>
          </section>
        ) : (
          groups.map((group, index) => {
            const open = isOpen(group.key, index)
            const showAll = expandedGroups.has(group.key)
            const rows = showAll ? group.records : group.records.slice(0, GROUP_ROW_LIMIT)
            const project = group.projectId ? projects.find((p) => p.id === group.projectId) : null
            return (
              <section key={group.key} className={`group-card${open ? ' open' : ''}`}>
                <div className="group-head">
                  <button type="button" className="group-toggle" aria-expanded={open} onClick={() => setGroupOpen(group.key, index, !open)}>
                    <span className={groupBy === 'project' ? 'group-title serif' : 'group-title'}>{group.label}</span>
                    {group.sublabel ? <span className="tag">{group.sublabel}</span> : null}
                    {group.archived ? <span className="tag muted-tag">Archived</span> : null}
                    <span className="group-summary">{summaryLine(group.records)}</span>
                    <StatusBar records={group.records} />
                    <span className="group-chevron">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                  </button>
                </div>
                {open ? (
                  <>
                    <RecordsTable records={rows} caption={`${group.label} records`} {...tableProps} />
                    <div className="group-foot">
                      <span className="muted">
                        Showing {rows.length} of {group.records.length} record{group.records.length === 1 ? '' : 's'}
                        {group.records.length > GROUP_ROW_LIMIT ? (
                          <>
                            {' · '}
                            <button
                              type="button"
                              className="link-button"
                              onClick={() =>
                                setExpandedGroups((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(group.key)) next.delete(group.key)
                                  else next.add(group.key)
                                  return next
                                })
                              }
                            >
                              {showAll ? 'Show fewer' : `Show all ${group.records.length}`}
                            </button>
                          </>
                        ) : null}
                      </span>
                      {project ? (
                        <Link className="link-button" to={`/projects/${project.id}`}>
                          Open {project.code} workspace <ArrowRight size={13} />
                        </Link>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </section>
            )
          })
        )}

        {selectedIds.size ? (
          <div className="selection-bar" role="region" aria-label="Selection">
            <strong>{selectedIds.size} selected</strong>
            <span className="grow" />
            {pendingSelected.length ? (
              <button type="button" className="button small light" onClick={() => navigate(`/review?ids=${pendingSelected.join(',')}`)}>
                <Check size={14} /> Review {pendingSelected.length} pending
              </button>
            ) : null}
            <button type="button" className="button small light" onClick={() => navigate('/export?scope=selected')}>
              <Download size={14} /> Export selected
            </button>
            <button type="button" className="button small light" onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
          </div>
        ) : null}
      </div>

      {modal === 'save-view' ? (
        <Modal
          title="Save view"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button type="button" className="button" disabled={!viewName.trim()} onClick={saveView}>
                Save view
              </button>
            </>
          }
        >
          <label className="field">
            View name
            <input autoFocus value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveView()} placeholder="e.g. S219B racks pending review" />
          </label>
          <p className="muted small-text">Saves the current filters, search, grouping, visible fields and sort.</p>
        </Modal>
      ) : null}

      {modal === 'manage-views' ? (
        <Modal
          title="Manage saved views"
          onClose={() => setModal(null)}
          footer={
            <button type="button" className="button secondary" onClick={() => setModal(null)}>
              Close
            </button>
          }
        >
          <div className="saved-views-manager">
            <div className="saved-view-row locked">
              <strong>All records</strong>
              <button type="button" className="button ghost small" onClick={() => persistViews(views.map((v) => ({ ...v, isDefault: false })))}>
                {views.some((v) => v.isDefault) ? 'Set default' : 'Default'}
              </button>
            </div>
            {views.map((view) => (
              <div className="saved-view-row" key={view.id}>
                <input aria-label="View name" value={view.name} onChange={(e) => persistViews(views.map((v) => (v.id === view.id ? { ...v, name: e.target.value } : v)))} />
                <button type="button" className="button ghost small" onClick={() => persistViews(views.map((v) => ({ ...v, isDefault: v.id === view.id })))}>
                  {view.isDefault ? 'Default' : 'Set default'}
                </button>
                <button
                  type="button"
                  className="button danger small"
                  onClick={() => {
                    persistViews(views.filter((v) => v.id !== view.id))
                    if (viewId === view.id) applyView('all')
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
            {!views.length ? <p className="muted">No saved views yet. Filter the records, then use Save view.</p> : null}
          </div>
        </Modal>
      ) : null}

      {modal === 'all-projects' ? (
        <Modal
          title="All projects"
          size="wide"
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => update({ ...filters, projectCodes: [] })}>
                Clear project filter
              </button>
              <button type="button" className="button" onClick={() => setModal(null)}>
                Done
              </button>
            </>
          }
        >
          <label className="search-field wide">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search all projects</span>
            <input autoFocus value={allProjectsQuery} onChange={(e) => setAllProjectsQuery(e.target.value)} placeholder="Search code, phase or notes" />
          </label>
          <div className="table-scroll modal-table">
            <table className="records-table">
              <thead>
                <tr>
                  <th className="select-col">
                    <span className="sr-only">Filter</span>
                  </th>
                  <th>Project</th>
                  <th>Phase</th>
                  <th>Status</th>
                  <th className="num">Records</th>
                  <th className="num">In results</th>
                  <th>Pin</th>
                </tr>
              </thead>
              <tbody>
                {allProjectsList.map((p) => (
                  <tr key={p.id} onClick={() => toggle('projectCodes', p.code)}>
                    <td className="select-col" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Filter by ${p.code}`} checked={filters.projectCodes.includes(p.code)} onChange={() => toggle('projectCodes', p.code)} />
                    </td>
                    <td className="strong">{p.code}</td>
                    <td>{p.phase || '—'}</td>
                    <td>{p.status}</td>
                    <td className="num">{records.filter((r) => r.projectId === p.id).length}</td>
                    <td className="num">{counts.projectCodes.get(p.code) || 0}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={`pin${pinned.includes(p.id) ? ' on' : ''}`} aria-pressed={pinned.includes(p.id)} aria-label={`Pin ${p.code}`} onClick={() => togglePin(p.id)}>
                        <Star size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!allProjectsList.length ? <p className="muted">No projects match.</p> : null}
        </Modal>
      ) : null}
    </div>
  )
}
