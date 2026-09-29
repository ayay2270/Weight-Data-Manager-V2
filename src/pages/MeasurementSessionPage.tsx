import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Check, CheckCircle2, CornerDownLeft, Info, User } from 'lucide-react'
import { DuplicateWarningModal } from '../components/DuplicateWarningModal'
import { StatusBadge } from '../components/ui'
import type { DataSource, Level, WeightRecord, WeightUnit } from '../data/types'
import { DATA_SOURCES, LEVELS } from '../data/types'
import { useRecordActions } from '../hooks/recordActions'
import { useData } from '../hooks/useData'
import { formatWeightKg, todayDate, toWeightKg } from '../utils/helpers'
import { PREF_KEYS, readPref, writePref } from '../utils/prefs'
import type { FieldIssue } from '../utils/recordValidation'
import { blankItem, buildSessionRecord, issueField, type SessionContext, type SessionItem } from '../utils/session'
import { configRequirement } from '../utils/weightWorkbookSchema'

const SESSION_KEY = 'wdm.v2.session'

interface StoredSession {
  step: 1 | 2 | 3
  ctx: SessionContext
  item: SessionItem
  logIds: string[]
}

function loadSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}
function storeSession(s: StoredSession | null) {
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}

function Req({ children }: { children: string }) {
  return (
    <span className="required-label">
      <span className="required-mark" aria-hidden="true">
        *
      </span>
      {children}
    </span>
  )
}

export function MeasurementSessionPage() {
  const { projects, records, settings, upsertRecord } = useData()
  const actions = useRecordActions()
  const [params, setParams] = useSearchParams()
  const activeProjects = projects.filter((p) => p.status === 'Active')

  const initialContext = (projectId?: string | null): SessionContext => {
    const pid =
      (projectId && activeProjects.some((p) => p.id === projectId) && projectId) ||
      (settings.defaultProjectId && activeProjects.some((p) => p.id === settings.defaultProjectId) && settings.defaultProjectId) ||
      activeProjects[0]?.id ||
      ''
    return {
      projectId: pid,
      buildPhase: projects.find((p) => p.id === pid)?.phase || '',
      level: 'Part',
      source: 'Internal Measurement',
      measuredBy: readPref<string>(PREF_KEYS.lastMeasuredBy, ''),
      measuredDate: todayDate(),
    }
  }

  const [session, setSession] = useState<StoredSession>(() => {
    const stored = loadSession()
    const requested = params.get('project')
    if (stored && stored.step === 2 && (!requested || requested === stored.ctx.projectId)) return stored
    const ctx = initialContext(requested)
    return { step: 1, ctx, item: blankItem(ctx, settings.defaultUnit), logIds: [] }
  })
  const [errors, setErrors] = useState<FieldIssue[]>([])
  const [pendingDup, setPendingDup] = useState<{ record: WeightRecord; duplicate: WeightRecord; finish: boolean } | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const descRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (params.get('project')) setParams({}, { replace: true })
  }, [params, setParams])
  useEffect(() => storeSession(session.step === 3 ? null : session), [session])

  const { step, ctx, item } = session
  const project = projects.find((p) => p.id === ctx.projectId)
  const log = useMemo(() => session.logIds.map((id) => records.find((r) => r.id === id)).filter((r): r is WeightRecord => Boolean(r)), [session.logIds, records])
  const configRule = configRequirement(ctx.level)
  const kg = item.weightValue.trim() === '' ? null : toWeightKg(Number(item.weightValue), item.weightUnit)
  const err = (field: string) => errors.find((e) => issueField(e) === field)

  const setCtx = (patch: Partial<SessionContext>) => setSession((s) => ({ ...s, ctx: { ...s.ctx, ...patch } }))
  const setItem = (patch: Partial<SessionItem>) => setSession((s) => ({ ...s, item: { ...s.item, ...patch } }))

  function begin() {
    const issues: FieldIssue[] = []
    if (!ctx.projectId) issues.push({ field: 'Project', message: 'Choose a project.', severity: 'error' })
    if (!ctx.measuredBy.trim()) issues.push({ field: 'Measured By', message: 'Measured By is required before submitting for review.', severity: 'error' })
    if (!ctx.measuredDate) issues.push({ field: 'Measured Date', message: 'Measured Date is required before submitting for review.', severity: 'error' })
    setErrors(issues)
    if (issues.length) return
    writePref(PREF_KEYS.lastMeasuredBy, ctx.measuredBy.trim())
    setSession((s) => ({ ...s, step: 2, item: blankItem(s.ctx, settings.defaultUnit, { weightUnit: s.item.weightUnit, supplier: s.item.supplier }) }))
    window.setTimeout(() => descRef.current?.focus(), 0)
  }

  function commit(record: WeightRecord, finish: boolean) {
    upsertRecord(record)
    setErrors([])
    setFlash(`Submitted “${record.description || 'Untitled'}” for review.`)
    setSession((s) => ({
      ...s,
      step: finish ? 3 : 2,
      logIds: [record.id, ...s.logIds],
      item: blankItem(s.ctx, settings.defaultUnit, { weightUnit: s.item.weightUnit, supplier: s.item.supplier }),
    }))
    if (!finish) window.setTimeout(() => descRef.current?.focus(), 0)
  }

  function submit(finish: boolean) {
    const result = buildSessionRecord(ctx, item, projects, records)
    if (!result.ok) {
      setErrors(result.issues)
      setFlash(null)
      window.setTimeout(() => errorRef.current?.focus(), 0)
      return
    }
    if (result.duplicate) {
      setPendingDup({ record: result.record, duplicate: result.duplicate, finish })
      return
    }
    commit(result.record, finish)
  }

  function restart(keepContext: boolean) {
    const c = keepContext ? ctx : initialContext(ctx.projectId)
    setErrors([])
    setFlash(null)
    setSession({ step: 1, ctx: c, item: blankItem(c, settings.defaultUnit), logIds: [] })
  }

  const steps = (
    <ol className="steps" aria-label="Session progress">
      {['Set up', 'Measure', 'Done'].map((label, i) => {
        const n = i + 1
        const state = step === n ? 'current' : step > n ? 'done' : ''
        return (
          <li key={label} className={state} aria-current={step === n ? 'step' : undefined}>
            <span className="step-n">{step > n ? <Check size={12} /> : n}</span>
            {label}
          </li>
        )
      })}
    </ol>
  )

  if (step === 1) {
    return (
      <div className="page">
        {steps}
        <header className="page-head">
          <div>
            <h1>Start a measurement session</h1>
            <p>Set what stays the same for this batch. After this you only enter each item and its weight.</p>
          </div>
        </header>
        <section className="panel session-setup">
          {errors.length ? (
            <div className="alert error" role="alert">
              {errors.map((e) => e.message).join(' ')}
            </div>
          ) : null}
          <h2>Project</h2>
          <p className="muted">The project phase is filled in for you; change it if this build differs.</p>
          <div className="project-picker" role="radiogroup" aria-label="Project">
            {activeProjects.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={ctx.projectId === p.id}
                className={`pick${ctx.projectId === p.id ? ' on' : ''}`}
                onClick={() => setCtx({ projectId: p.id, buildPhase: p.phase || '' })}
              >
                <b>{p.code}</b>
                <span>{p.phase || 'No phase'}</span>
                {ctx.projectId === p.id ? <CheckCircle2 size={18} className="pick-check" /> : null}
              </button>
            ))}
            {!activeProjects.length ? <p className="muted">No active projects. Create one on the Projects page first.</p> : null}
          </div>
          <div className="form-grid session-grid">
            <label>
              Build / Phase
              <input value={ctx.buildPhase} onChange={(e) => setCtx({ buildPhase: e.target.value })} placeholder="e.g. DV, PVT" />
            </label>
            <div className="field">
              Level
              <div className="segmented full" role="radiogroup" aria-label="Level">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    role="radio"
                    aria-checked={ctx.level === l}
                    aria-pressed={ctx.level === l}
                    onClick={() => setSession((s) => ({ ...s, ctx: { ...s.ctx, level: l as Level }, item: blankItem({ ...s.ctx, level: l as Level }, settings.defaultUnit) }))}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <label>
              Source
              <select value={ctx.source} onChange={(e) => setCtx({ source: e.target.value as DataSource })}>
                {DATA_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={err('measuredBy') ? 'has-error' : undefined}>
              <Req>Measured By</Req>
              <input value={ctx.measuredBy} onChange={(e) => setCtx({ measuredBy: e.target.value })} placeholder="Tester name" autoComplete="name" />
            </label>
            <label>
              <Req>Measured Date</Req>
              <input type="date" value={ctx.measuredDate} onChange={(e) => setCtx({ measuredDate: e.target.value })} />
            </label>
          </div>
          <div className="session-foot">
            <span className="muted">
              <Info size={14} /> Weights default to {ctx.level === 'Part' ? 'grams for parts' : `${settings.defaultUnit} for ${ctx.level.toLowerCase()}s`}; you can switch per item.
            </span>
            <button type="button" className="button" onClick={begin} disabled={!activeProjects.length}>
              Start measuring <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (step === 3) {
    return (
      <div className="page">
        {steps}
        <section className="panel session-done">
          <CheckCircle2 size={40} className="tone-verified-text" />
          <h1>
            {log.length} measurement{log.length === 1 ? '' : 's'} submitted
          </h1>
          <p className="muted">All are Pending Review in {project?.code}. An engineer verifies them in a review session.</p>
          <ol className="plain-list">
            {log.map((r) => (
              <li key={r.id}>
                <button type="button" className="desc-link" onClick={() => actions.view(r)}>
                  {r.description || 'Untitled'}
                </button>
                <StatusBadge status={r.status} compact />
                <b>{formatWeightKg(r)}</b>
              </li>
            ))}
          </ol>
          <div className="button-row center">
            {project ? (
              <Link className="button secondary" to={`/projects/${project.id}`}>
                Open {project.code}
              </Link>
            ) : null}
            {project ? (
              <Link className="button secondary" to={`/review?project=${project.id}`}>
                Review them
              </Link>
            ) : null}
            <button type="button" className="button" onClick={() => restart(true)}>
              Start another session
            </button>
          </div>
        </section>
      </div>
    )
  }

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit(false)
    }
  }

  return (
    <div className="page">
      {steps}
      <div className="session-layout">
        <section className="panel">
          <div className="context-bar">
            <span className="live-dot" aria-hidden="true" />
            <strong>Session</strong>
            <span className="tag">{project?.code}</span>
            <span className="tag">{ctx.buildPhase || 'No phase'}</span>
            <span className="tag">{ctx.level}</span>
            <span className="tag">{ctx.source}</span>
            <span className="tag">
              <User size={12} /> {ctx.measuredBy}
            </span>
            <span className="tag">{ctx.measuredDate}</span>
            <button type="button" className="link-button push-right" onClick={() => setSession((s) => ({ ...s, step: 1 }))}>
              Change setup
            </button>
          </div>

          {errors.length ? (
            <div className="alert error" role="alert" tabIndex={-1} ref={errorRef}>
              <div>
                <strong>Please fix {errors.length === 1 ? 'this field' : `${errors.length} fields`}:</strong>
                <ul>
                  {errors.map((e) => (
                    <li key={e.field}>{e.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : flash ? (
            <div className="alert success" role="status">
              {flash} Context kept for the next item.
            </div>
          ) : null}

          <div className="form-grid session-grid">
            <label className="span-2">
              Description
              <input ref={descRef} value={item.description} onChange={(e) => setItem({ description: e.target.value })} onKeyDown={onEnter} placeholder="Part / node / rack / package description" autoComplete="off" />
            </label>
            <label className={`span-2${err('weightValue') ? ' has-error' : ''}`}>
              <Req>Weight</Req>
              <div className="weight-input big">
                <input type="number" step="any" min="0" value={item.weightValue} onChange={(e) => setItem({ weightValue: e.target.value })} onKeyDown={onEnter} placeholder="0" aria-invalid={Boolean(err('weightValue'))} />
                <div className="segmented" role="radiogroup" aria-label="Weight unit">
                  {(['g', 'kg'] as WeightUnit[]).map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={item.weightUnit === u} aria-pressed={item.weightUnit === u} onClick={() => setItem({ weightUnit: u })}>
                      {u}
                    </button>
                  ))}
                </div>
              </div>
              <small className="weight-preview">{kg != null && Number.isFinite(kg) ? `Stored as ${kg.toFixed(3)} kg` : 'Stored in kilograms'}</small>
            </label>
            <label>
              Lenovo PN
              <input value={item.lenovoPn} onChange={(e) => setItem({ lenovoPn: e.target.value })} onKeyDown={onEnter} />
            </label>
            <label>
              MSFT / Customer PN
              <input value={item.customerPn} onChange={(e) => setItem({ customerPn: e.target.value })} onKeyDown={onEnter} />
            </label>
            {ctx.level !== 'Package' ? (
              <label>
                Manufacturer
                <input value={item.manufacturer} onChange={(e) => setItem({ manufacturer: e.target.value })} onKeyDown={onEnter} />
              </label>
            ) : null}
            <label>
              Part Category
              <input value={item.category} onChange={(e) => setItem({ category: e.target.value })} onKeyDown={onEnter} />
            </label>
            <label className={`span-2${err('configuration') ? ' has-error' : ''}`}>
              {configRule === 'required' ? <Req>Configuration / Included Items</Req> : 'Configuration / Included Items'}
              <input value={item.configuration} onChange={(e) => setItem({ configuration: e.target.value })} onKeyDown={onEnter} placeholder="e.g. Full rack + 8 GPU + HSK + PSU + cable, without pallet" />
              {configRule === 'recommended' && !item.configuration.trim() ? <small className="field-warn">Recommended for {ctx.level} records.</small> : null}
              {configRule === 'optional' ? <small className="muted">Optional for Part-level records.</small> : null}
            </label>
            <label className={err('supplier') ? 'has-error' : ctx.source === 'Supplier' ? undefined : 'soft-field'}>
              {ctx.source === 'Supplier' ? <Req>Supplier / Data Provider</Req> : 'Supplier / Data Provider'}
              <input value={item.supplier} onChange={(e) => setItem({ supplier: e.target.value })} onKeyDown={onEnter} />
            </label>
            <label className="soft-field">
              Reference / Document Rev.
              <input value={item.reference} onChange={(e) => setItem({ reference: e.target.value })} onKeyDown={onEnter} />
            </label>
            <label className="span-2">
              Notes
              <input value={item.note} maxLength={500} onChange={(e) => setItem({ note: e.target.value })} onKeyDown={onEnter} />
            </label>
          </div>

          <div className="session-foot">
            <span className="muted">
              <CornerDownLeft size={14} /> Enter submits and starts the next item
            </span>
            <span className="button-row">
              <button type="button" className="button secondary" onClick={() => submit(true)}>
                Submit for Review &amp; finish
              </button>
              <button type="button" className="button" onClick={() => submit(false)}>
                Submit &amp; Add Next
              </button>
            </span>
          </div>
        </section>

        <aside className="panel session-log" aria-label="Session log">
          <h2>This session</h2>
          <p className="muted">{log.length ? `${log.length} submitted for review` : 'Submitted measurements appear here.'}</p>
          <ol className="log-list">
            {log.map((r, i) => (
              <li key={r.id}>
                <span className="log-n">{log.length - i}</span>
                <span className="log-main">
                  <button type="button" className="desc-link" onClick={() => actions.view(r)}>
                    {r.description || 'Untitled'}
                  </button>
                  <small>{r.lenovoPn || 'No PN'}</small>
                </span>
                <b>{formatWeightKg(r)}</b>
              </li>
            ))}
          </ol>
          {log.length ? (
            <button type="button" className="button secondary full" onClick={() => setSession((s) => ({ ...s, step: 3 }))}>
              Finish session
            </button>
          ) : null}
        </aside>
      </div>

      {pendingDup ? (
        <DuplicateWarningModal
          existing={pendingDup.duplicate}
          draft={{
            projectCode: pendingDup.record.projectCode,
            buildPhase: pendingDup.record.buildPhase,
            level: pendingDup.record.level,
            description: pendingDup.record.description,
            lenovoPn: pendingDup.record.lenovoPn,
            configuration: pendingDup.record.configuration,
            weightLabel:
              pendingDup.record.weightValue == null
                ? '—'
                : `${pendingDup.record.weightValue} ${pendingDup.record.weightUnit} (${(pendingDup.record.weight_kg ?? 0).toFixed(3)} kg)`,
            measuredDate: pendingDup.record.measuredDate,
            measuredBy: pendingDup.record.measuredBy,
          }}
          onCancel={() => setPendingDup(null)}
          onOpenExisting={() => {
            const existing = pendingDup.duplicate
            setPendingDup(null)
            actions.view(existing)
          }}
          onSaveAnyway={() => {
            const { record, finish } = pendingDup
            setPendingDup(null)
            commit(record, finish)
          }}
        />
      ) : null}
    </div>
  )
}
