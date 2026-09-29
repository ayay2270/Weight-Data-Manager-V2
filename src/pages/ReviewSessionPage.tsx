import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, RotateCcw, SkipForward, XCircle } from 'lucide-react'
import { StatusBadge } from '../components/ui'
import type { WeightRecord } from '../data/types'
import { useRecordActions } from '../hooks/recordActions'
import { useData } from '../hooks/useData'
import { formatWeightKg, getWeightKg } from '../utils/helpers'
import { PREF_KEYS, readPref, writePref } from '../utils/prefs'
import { sortRecords } from '../utils/recordFilters'
import { applyReview, type ReviewDecision } from '../utils/review'

type Tab = 'pending' | 'returned'

function normPn(v?: string | null) {
  return (v || '').replace(/\s+/g, '').toLowerCase()
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="drawer-row">
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : '—'}</dd>
    </div>
  )
}

export function ReviewSessionPage() {
  const { projects, records, upsertRecord } = useData()
  const actions = useRecordActions()
  // Links from other pages (?id=, ?ids=, ?project=) are read once; App remounts this page when the query changes.
  const [params] = useSearchParams()
  const [projectId, setProjectId] = useState(() => params.get('project') || '')
  const [onlyIds, setOnlyIds] = useState<string[] | null>(() => (params.get('ids') ? params.get('ids')!.split(',').filter(Boolean) : null))
  const [currentId, setCurrentId] = useState<string | null>(() => params.get('id'))
  const [tab, setTab] = useState<Tab>('pending')
  const [reviewer, setReviewer] = useState(() => readPref<string>(PREF_KEYS.lastReviewer, ''))
  const [comment, setComment] = useState('')
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [done, setDone] = useState(0)
  const [lastDecision, setLastDecision] = useState<string | null>(null)
  const commentRef = useRef<HTMLTextAreaElement>(null)
  const reviewerRef = useRef<HTMLInputElement>(null)

  const queue = useMemo(() => {
    const status = tab === 'pending' ? 'Pending Review' : 'Need Recheck'
    let list = records.filter((r) => r.status === status && (!projectId || r.projectId === projectId))
    if (onlyIds && tab === 'pending') {
      const only = list.filter((r) => onlyIds.includes(r.id))
      if (only.length) list = only
    }
    return sortRecords(list, 'measuredDate', 'asc')
  }, [records, tab, projectId, onlyIds])

  const current: WeightRecord | null = queue.find((r) => r.id === currentId) || queue[0] || null
  const index = current ? queue.findIndex((r) => r.id === current.id) : -1

  function move(delta: number) {
    if (!queue.length) return
    const next = queue[(index + delta + queue.length) % queue.length]
    setCurrentId(next.id)
    setComment('')
    setError(null)
  }

  function decide(status: ReviewDecision) {
    if (!current) return
    const result = applyReview(current, status, reviewer, comment)
    if (!result.ok) {
      setError({ field: result.field, message: result.error })
      ;(result.field === 'reviewer' ? reviewerRef : commentRef).current?.focus()
      return
    }
    const nextInQueue = queue[index + 1] || queue[index - 1] || null
    upsertRecord(result.record)
    writePref(PREF_KEYS.lastReviewer, reviewer.trim())
    setDone((n) => n + 1)
    setLastDecision(`${current.description || 'Record'} → ${status}`)
    setComment('')
    setError(null)
    setCurrentId(nextInQueue && nextInQueue.id !== current.id ? nextInQueue.id : null)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : document.body
      if (t.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.drawer-backdrop, .modal-backdrop')) return
      if (tab !== 'pending') return
      if (e.key === 'v') decide('Verified')
      else if (e.key === 'r' || e.key === 'x') {
        e.preventDefault()
        commentRef.current?.focus()
      } else if (e.key === 'j') move(1)
      else if (e.key === 'k') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const related = useMemo(() => {
    if (!current) return []
    const pn = normPn(current.lenovoPn)
    return records.filter((r) => r.id !== current.id && ((pn && normPn(r.lenovoPn) === pn) || (current.description && r.description === current.description)))
  }, [current, records])
  const previous = useMemo(
    () =>
      related
        .filter((r) => r.projectId === current?.projectId && (r.measuredDate || '') <= (current?.measuredDate || ''))
        .sort((a, b) => (b.measuredDate || '').localeCompare(a.measuredDate || ''))[0] || null,
    [related, current],
  )
  const peers = useMemo(
    () => (current ? records.filter((r) => r.projectId === current.projectId && r.level === current.level && (getWeightKg(r) ?? 0) > 0) : []),
    [current, records],
  )
  const kgs = peers.map((r) => getWeightKg(r) as number)
  const lo = Math.log10(Math.min(...kgs, 1))
  const hi = Math.log10(Math.max(...kgs, 1))
  const pos = (kg: number) => (hi === lo ? 50 : ((Math.log10(kg) - lo) / (hi - lo)) * 96 + 2)
  const currentKg = current ? getWeightKg(current) : null
  const delta = (other: WeightRecord) => {
    const a = getWeightKg(other)
    return a && currentKg != null ? ((currentKg - a) / a) * 100 : null
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Review session</h1>
          <p>One record at a time. Each decision is saved immediately and the next record opens.</p>
        </div>
        <div className="head-tools">
          <label className="select-field">
            <span className="sr-only">Project</span>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value)
                setOnlyIds(null)
                setCurrentId(null)
              }}
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code}
                  {p.status === 'Archived' ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Queue">
            <button type="button" aria-pressed={tab === 'pending'} onClick={() => { setTab('pending'); setCurrentId(null) }}>
              Pending
            </button>
            <button type="button" aria-pressed={tab === 'returned'} onClick={() => { setTab('returned'); setCurrentId(null) }}>
              Returned to testers
            </button>
          </div>
        </div>
      </header>

      {lastDecision ? (
        <div className="alert success" role="status">
          Saved: {lastDecision}. {done} reviewed this session.
        </div>
      ) : null}

      {!current ? (
        <div className="empty-state">
          <CheckCircle2 size={36} className="tone-verified-text" />
          <h3>{tab === 'pending' ? 'Nothing waiting for review' : 'Nothing returned to testers'}</h3>
          <p>{done ? `You reviewed ${done} record${done === 1 ? '' : 's'} in this session.` : 'Try another project or the other queue.'}</p>
          <Link className="button secondary" to="/">
            Back to projects
          </Link>
        </div>
      ) : (
        <div className="review-layout">
          <nav className="panel review-queue" aria-label="Review queue">
            <h2>
              {tab === 'pending' ? 'Pending' : 'Returned'} · {queue.length}
              {onlyIds && tab === 'pending' ? ' selected' : ''}
            </h2>
            <ol>
              {queue.map((r) => (
                <li key={r.id}>
                  <button type="button" className={r.id === current.id ? 'on' : undefined} aria-current={r.id === current.id ? 'true' : undefined} onClick={() => { setCurrentId(r.id); setError(null); setComment('') }}>
                    <b>{r.description || 'Untitled'}</b>
                    <span>{formatWeightKg(r)}</span>
                    <small>
                      {r.projectCode} · {r.level} · {r.measuredDate || '—'}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
            {onlyIds ? (
              <button type="button" className="link-button" onClick={() => setOnlyIds(null)}>
                Show the whole queue
              </button>
            ) : null}
          </nav>

          <article className="panel review-card" aria-label="Record under review">
            <div className="review-card-top">
              <span>
                <StatusBadge status={current.status} /> <span className="muted">{index + 1} of {queue.length}</span>
              </span>
              <span className="button-row">
                <button type="button" className="icon-button" aria-label="Previous record (K)" onClick={() => move(-1)}>
                  <ChevronLeft size={18} />
                </button>
                <button type="button" className="icon-button" aria-label="Next record (J)" onClick={() => move(1)}>
                  <ChevronRight size={18} />
                </button>
              </span>
            </div>
            <div className="progress" aria-hidden="true">
              <i style={{ width: `${((index + 1) / queue.length) * 100}%` }} />
            </div>
            <p className="eyebrow">
              {current.projectCode} · {current.buildPhase || 'No phase'} · {current.level}
            </p>
            <h2 className="review-title">{current.description || 'Untitled'}</h2>
            <div className="weight-hero">
              <strong>
                {current.weightValue == null ? '—' : +current.weightValue.toFixed(3)}
                <small>{current.weightValue == null ? 'no weight recorded' : current.weightUnit}</small>
              </strong>
              <span className="muted">
                {formatWeightKg(current)} stored · {current.source}
              </span>
            </div>
            {current.status === 'Need Recheck' ? (
              <div className="callout terra">
                <strong>Returned by {current.reviewedBy || '—'}</strong>
                {current.reviewComment || 'No comment.'}
              </div>
            ) : null}
            <dl className="drawer-dl two">
              <Detail label="Lenovo PN" value={current.lenovoPn} />
              <Detail label="MSFT PN" value={current.customerPn} />
              <Detail label="Manufacturer" value={current.manufacturer} />
              <Detail label="Part Category" value={current.category} />
              <Detail label="Configuration" value={current.configuration} />
              <Detail label="Source" value={current.source} />
              <Detail label="Supplier / Data Provider" value={current.supplier} />
              <Detail label="Reference / Document Rev." value={current.reference} />
              <Detail label="Measured By" value={current.measuredBy} />
              <Detail label="Measured Date" value={current.measuredDate} />
              <Detail label="Notes" value={current.note} />
            </dl>

            <h3 className="section-label">Context</h3>
            {previous ? (
              <p className="context-line">
                Previous measurement in {previous.projectCode}: <b>{formatWeightKg(previous)}</b> ({previous.measuredDate || 'no date'}, {previous.status})
              </p>
            ) : null}
            {related.length ? (
              <table className="records-table compact">
                <caption className="sr-only">Same part or description in other records</caption>
                <thead>
                  <tr>
                    <th>Same PN / description</th>
                    <th>Status</th>
                    <th className="num">Weight</th>
                    <th className="num">This vs. it</th>
                  </tr>
                </thead>
                <tbody>
                  {related.map((r) => {
                    const d = delta(r)
                    return (
                      <tr key={r.id} onClick={() => actions.view(r)}>
                        <td>
                          {r.projectCode} · {r.buildPhase || '—'}
                        </td>
                        <td>
                          <StatusBadge status={r.status} compact />
                        </td>
                        <td className="num">{formatWeightKg(r)}</td>
                        <td className={`num${d != null && Math.abs(d) > 5 ? ' tone-recheck-text' : ''}`}>{d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="muted">No other record shares this Lenovo PN or description.</p>
            )}
            {peers.length > 1 && currentKg ? (
              <>
                <p className="context-line">
                  Among {peers.length} {current.level.toLowerCase()} weights in {current.projectCode} (log scale)
                </p>
                <div className="dist" role="img" aria-label={`This record's weight relative to ${peers.length} other ${current.level} records`}>
                  {peers.map((r) => (
                    <i key={r.id} className={r.id === current.id ? 'me' : undefined} style={{ left: `${pos(getWeightKg(r) as number)}%` }} title={`${r.description}: ${formatWeightKg(r)}`} />
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <aside className="panel review-decide" aria-label="Decision">
            {tab === 'pending' ? (
              <>
                <h2>Your decision</h2>
                <label className={`field${error?.field === 'reviewer' ? ' has-error' : ''}`}>
                  <span className="required-label">
                    <span className="required-mark" aria-hidden="true">
                      *
                    </span>
                    Reviewer
                  </span>
                  <input ref={reviewerRef} value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Engineer name" autoComplete="name" />
                </label>
                <label className={`field${error?.field === 'comment' ? ' has-error' : ''}`}>
                  Review Comment
                  <textarea ref={commentRef} rows={3} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional for Verify; required for Need Recheck and Reject" />
                  <small className="muted">{comment.length} / 500</small>
                </label>
                {error ? (
                  <div className="alert error" role="alert">
                    {error.message}
                  </div>
                ) : null}
                <button type="button" className="button decide verify" onClick={() => decide('Verified')}>
                  <CheckCircle2 size={20} /> Verify <kbd>V</kbd>
                </button>
                <button type="button" className="button secondary decide" onClick={() => decide('Need Recheck')}>
                  <RotateCcw size={20} /> Need Recheck
                </button>
                <button type="button" className="button secondary decide" onClick={() => decide('Rejected')}>
                  <XCircle size={20} /> Reject
                </button>
                <button type="button" className="button ghost decide" onClick={() => move(1)}>
                  <SkipForward size={18} /> Skip for now <kbd>J</kbd>
                </button>
                <p className="muted small-text">Reviewed this session: {done}. R or X jumps to the comment.</p>
              </>
            ) : (
              <>
                <h2>Returned to tester</h2>
                <p className="muted">Waiting for the tester to update the measurement and resubmit it for review.</p>
                <button type="button" className="button decide" onClick={() => actions.edit(current)}>
                  Update measurement
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
