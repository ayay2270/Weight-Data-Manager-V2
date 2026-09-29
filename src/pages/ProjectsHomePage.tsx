import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, Clock3, PencilLine, Plus, RotateCcw, Scale, Search } from 'lucide-react'
import { ProjectFormModal } from '../components/ProjectFormModal'
import { ProgressRing, StatusBar } from '../components/ui'
import { LEVELS } from '../data/types'
import { useData } from '../hooks/useData'
import { projectActivity } from '../utils/projectFacet'
import { statusCounts } from '../utils/recordFilters'

type Tab = 'Active' | 'Archived' | 'All'

export function ProjectsHomePage() {
  const { projects, records } = useData()
  const [tab, setTab] = useState<Tab>('Active')
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const totals = statusCounts(records)
  const activity = useMemo(() => projectActivity(projects, records), [projects, records])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects
      .filter((p) => tab === 'All' || p.status === tab)
      .filter((p) => !q || [p.code, p.phase, p.notes, p.name].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => (activity.get(b.id) || '').localeCompare(activity.get(a.id) || '') || a.code.localeCompare(b.code))
  }, [projects, tab, query, activity])

  return (
    <div className="page">
      <div className="attention">
        <Link to="/review" className="attention-card">
          <span className="attention-n">{totals['Pending Review']}</span>
          <span className="attention-text">
            <strong>Pending review</strong>
            <span>Start a review session</span>
          </span>
          <span className="attention-icon tone-pending">
            <Clock3 size={22} />
          </span>
        </Link>
        <Link to="/records?status=Need%20Recheck" className="attention-card">
          <span className="attention-n">{totals['Need Recheck']}</span>
          <span className="attention-text">
            <strong>Need recheck</strong>
            <span>Returned to testers with a comment</span>
          </span>
          <span className="attention-icon tone-recheck">
            <RotateCcw size={22} />
          </span>
        </Link>
        <Link to="/records?status=Draft" className="attention-card">
          <span className="attention-n">{totals.Draft}</span>
          <span className="attention-text">
            <strong>Drafts</strong>
            <span>Not yet submitted for review</span>
          </span>
          <span className="attention-icon tone-draft">
            <PencilLine size={22} />
          </span>
        </Link>
      </div>

      <header className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Each project keeps its own records, review queue and history.</p>
        </div>
        <div className="head-tools">
          <div className="segmented" role="group" aria-label="Project status">
            {(['Active', 'Archived', 'All'] as Tab[]).map((t) => (
              <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t} <span className="chip-count">{t === 'All' ? projects.length : projects.filter((p) => p.status === t).length}</span>
              </button>
            ))}
          </div>
          <label className="search-field compact">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Find a project</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a project" />
          </label>
        </div>
      </header>

      <div className="project-grid">
        {list.map((p) => {
          const rs = records.filter((r) => r.projectId === p.id)
          const c = statusCounts(rs)
          const last = rs.map((r) => r.measuredDate || '').filter(Boolean).sort().at(-1)
          return (
            <article key={p.id} className={`project-card${p.status === 'Archived' ? ' archived' : ''}`}>
              <div className="project-card-top">
                <div>
                  <h2>
                    <Link to={`/projects/${p.id}`}>{p.code}</Link>
                  </h2>
                  <div className="tags">
                    <span className="tag">{p.phase || 'No phase'}</span>
                    {p.status === 'Archived' ? <span className="tag muted-tag">Archived</span> : null}
                  </div>
                </div>
                <ProgressRing value={rs.length ? c.Verified / rs.length : 0} />
              </div>
              {p.notes ? <p className="project-notes">{p.notes}</p> : null}
              <div className="level-grid">
                {LEVELS.map((l) => (
                  <div key={l}>
                    <b>{rs.filter((r) => r.level === l).length}</b>
                    <span>{l}</span>
                  </div>
                ))}
              </div>
              <div className="project-meta">
                <span>
                  <b>{rs.length}</b> records · {c.Verified} verified · {c['Pending Review']} pending · {c['Need Recheck']} recheck
                </span>
                <StatusBar records={rs} width={120} />
              </div>
              <div className="project-meta muted">{last ? `Last measured ${last}` : 'No measurements yet'}</div>
              <div className="project-actions">
                <Link className="button secondary small" to={`/projects/${p.id}`}>
                  Open project <ArrowRight size={14} />
                </Link>
                {p.status === 'Active' ? (
                  <Link className="button ghost small" to={`/measure?project=${p.id}`}>
                    <Scale size={14} /> Measure
                  </Link>
                ) : null}
                {c['Pending Review'] ? (
                  <Link className="button ghost small" to={`/review?project=${p.id}`}>
                    <Check size={14} /> Review
                  </Link>
                ) : null}
              </div>
            </article>
          )
        })}
        <button type="button" className="new-project-card" onClick={() => setCreating(true)}>
          <Plus size={26} /> New project
        </button>
      </div>
      {!list.length ? <p className="muted">No projects match.</p> : null}
      {creating ? <ProjectFormModal project={null} onClose={() => setCreating(false)} /> : null}
    </div>
  )
}
