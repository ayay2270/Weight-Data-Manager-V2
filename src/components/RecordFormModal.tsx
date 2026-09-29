import { useEffect, useMemo, useRef, useState } from 'react'
import type { DataSource, Level, Project, RecordStatus, WeightRecord, WeightUnit } from '../data/types'
import { DATA_SOURCES, LEVELS } from '../data/types'
import { findPossibleDuplicate } from '../utils/duplicates'
import { canEditMeasurement, nowIso, todayDate, toWeightKg, uid } from '../utils/helpers'
import { validateSubmitMeasurement } from '../utils/recordValidation'
import { configRequirement } from '../utils/weightWorkbookSchema'
import { DuplicateWarningModal, type DuplicateDraft } from './DuplicateWarningModal'
import { Modal } from './Modal'

interface RecordFormModalProps {
  open: boolean
  projects: Project[]
  records?: WeightRecord[]
  initial?: WeightRecord | null
  prefill?: WeightRecord | null
  defaultProjectId?: string | null
  defaultUnit?: WeightUnit
  onClose: () => void
  onSave: (record: WeightRecord) => void
  onOpenExisting?: (record: WeightRecord) => void
}

type SaveIntent = 'draft' | 'submit' | 'resubmit' | 'keep' | 'addNext'

const emptyForm = {
  projectId: '',
  buildPhase: '',
  level: 'Part' as Level,
  description: '',
  lenovoPn: '',
  customerPn: '',
  manufacturer: '',
  category: '',
  weightValue: '',
  weightUnit: 'g' as WeightUnit,
  configuration: '',
  source: 'Internal Measurement' as DataSource,
  supplier: '',
  reference: '',
  measuredBy: '',
  measuredDate: '',
  note: '',
}

function RequiredLabel({ children }: { children: string }) {
  return (
    <span className="required-label">
      <span className="required-mark" aria-hidden="true">*</span>
      {children}
    </span>
  )
}

export function RecordFormModal({
  open,
  projects,
  records = [],
  initial,
  prefill,
  defaultProjectId,
  defaultUnit = 'kg',
  onClose,
  onSave,
  onOpenExisting,
}: RecordFormModalProps) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    intent: SaveIntent
    record: WeightRecord
    duplicate: WeightRecord
    draft: DuplicateDraft
  } | null>(null)
  const descriptionRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        projectId: initial.projectId,
        buildPhase: initial.buildPhase || '',
        level: initial.level,
        description: initial.description,
        lenovoPn: initial.lenovoPn || '',
        customerPn: initial.customerPn || '',
        manufacturer: initial.manufacturer || '',
        category: initial.category || '',
        weightValue: initial.weightValue != null ? String(initial.weightValue) : '',
        weightUnit: initial.weightUnit,
        configuration: initial.configuration || '',
        source: initial.source,
        supplier: initial.supplier || '',
        reference: initial.reference || '',
        measuredBy: initial.measuredBy || '',
        measuredDate: initial.measuredDate || '',
        note: initial.note || '',
      })
    } else if (prefill) {
      setForm({
        projectId: prefill.projectId,
        buildPhase: prefill.buildPhase || '',
        level: prefill.level,
        description: prefill.description,
        lenovoPn: prefill.lenovoPn || '',
        customerPn: prefill.customerPn || '',
        manufacturer: prefill.manufacturer || '',
        category: prefill.category || '',
        weightValue: prefill.weightValue != null ? String(prefill.weightValue) : '',
        weightUnit: prefill.weightUnit,
        configuration: prefill.configuration || '',
        source: prefill.source,
        supplier: prefill.supplier || '',
        reference: prefill.reference || '',
        measuredBy: prefill.measuredBy || '',
        measuredDate: prefill.measuredDate || todayDate(),
        note: prefill.note || '',
      })
    } else {
      const projectId = defaultProjectId || projects[0]?.id || ''
      const project = projects.find((p) => p.id === projectId)
      const level: Level = 'Part'
      setForm({
        ...emptyForm,
        projectId,
        buildPhase: project?.phase || '',
        level,
        weightUnit: level === 'Part' ? 'g' : defaultUnit,
        measuredDate: todayDate(),
      })
    }
    setError(null)
    setSuccess(null)
    setPending(null)
  }, [open, initial, prefill, defaultProjectId, defaultUnit, projects])

  const showPartFields = form.level === 'Part' || form.level === 'Node' || form.level === 'Rack'
  const showPackageHint = form.level === 'Package'
  const showSupplierEmphasis = form.source === 'Supplier'
  const convertedKg = form.weightValue.trim() === '' ? null : toWeightKg(Number(form.weightValue), form.weightUnit)
  const currentStatus: RecordStatus | null = initial?.status ?? null
  const recheckReason =
    currentStatus === 'Need Recheck' && initial?.reviewComment?.trim()
      ? initial.reviewComment.trim()
      : null
  const configRule = configRequirement(form.level)
  const configEmpty = !form.configuration.trim()

  const activeProjects = useMemo(
    () => projects.filter((p) => p.status === 'Active' || p.id === form.projectId),
    [projects, form.projectId],
  )

  if (!open) return null

  function setLevel(level: Level) {
    setForm((prev) => ({
      ...prev,
      level,
      category: level === 'Package' && !prev.category ? 'Packaging' : prev.category,
      weightUnit: level === 'Part' ? 'g' : prev.weightUnit === 'g' ? defaultUnit : prev.weightUnit,
    }))
  }

  function setProject(projectId: string) {
    setForm((prev) => {
      const project = projects.find((p) => p.id === projectId)
      if (initial) return { ...prev, projectId }
      return {
        ...prev,
        projectId,
        buildPhase: project?.phase || '',
      }
    })
  }

  function resolveStatus(intent: SaveIntent): {
    status: RecordStatus
    reviewedBy: string | null
    reviewedDate: string | null
    reviewComment: string | null
  } {
    if (!initial) {
      return {
        status: intent === 'submit' || intent === 'addNext' ? 'Pending Review' : 'Draft',
        reviewedBy: null,
        reviewedDate: null,
        reviewComment: null,
      }
    }

    if (intent === 'draft') {
      return {
        status: 'Draft',
        reviewedBy: null,
        reviewedDate: null,
        reviewComment: null,
      }
    }

    if (intent === 'submit' || intent === 'resubmit') {
      return {
        status: 'Pending Review',
        reviewedBy: null,
        reviewedDate: null,
        reviewComment: null,
      }
    }

    // Saving a Verified record requires a new review round.
    if (intent === 'keep' && initial.status === 'Verified') {
      return {
        status: 'Pending Review',
        reviewedBy: null,
        reviewedDate: null,
        reviewComment: null,
      }
    }

    return {
      status: initial.status,
      reviewedBy: initial.reviewedBy ?? null,
      reviewedDate: initial.reviewedDate ?? null,
      reviewComment: initial.reviewComment ?? null,
    }
  }

  function buildRecord(intent: SaveIntent): WeightRecord | null {
    const project = projects.find((p) => p.id === form.projectId)
    if (!project) {
      setError('Please select a project.')
      return null
    }
    const weightValue = form.weightValue.trim() === '' ? null : Number(form.weightValue)
    if (form.weightValue.trim() !== '' && !Number.isFinite(weightValue)) {
      setError('Weight must be a valid number.')
      return null
    }

    if (initial && !canEditMeasurement(initial.status)) {
      setError('This record cannot be edited in its current status.')
      return null
    }

    const requiresSubmitValidation =
      intent === 'submit' ||
      intent === 'resubmit' ||
      intent === 'addNext' ||
      (intent === 'keep' && initial?.status === 'Verified')

    if (requiresSubmitValidation) {
      const submitIssues = validateSubmitMeasurement({
        level: form.level,
        description: form.description,
        weightValue,
        weightUnit: form.weightUnit,
        configuration: form.configuration,
        source: form.source,
        supplier: form.supplier,
        measuredBy: form.measuredBy,
        measuredDate: form.measuredDate,
      })
      if (submitIssues.length) {
        setError(submitIssues[0].message)
        return null
      }
    }

    const resolved = resolveStatus(intent)

    const stamp = nowIso()
    return {
      id: initial?.id || uid('rec'),
      projectId: project.id,
      projectCode: project.code,
      level: form.level,
      description: form.description.trim(),
      lenovoPn: form.lenovoPn.trim() || null,
      customerPn: form.customerPn.trim() || null,
      manufacturer: showPartFields ? form.manufacturer.trim() || null : null,
      category: form.category.trim() || (form.level === 'Package' ? 'Packaging' : null),
      weightValue,
      weightUnit: form.weightUnit,
      weight_kg: toWeightKg(weightValue, form.weightUnit),
      buildPhase: form.buildPhase.trim() || null,
      configuration: form.configuration.trim() || null,
      supplier: form.supplier.trim() || null,
      reference: form.reference.trim() || null,
      measuredBy: form.measuredBy.trim() || null,
      measuredDate: form.measuredDate || null,
      source: form.source,
      status: resolved.status,
      reviewedBy: resolved.reviewedBy,
      reviewedDate: resolved.reviewedDate,
      reviewComment: resolved.reviewComment,
      note: form.note.trim() || null,
      originalWeightText: initial?.originalWeightText || null,
      createdAt: initial?.createdAt || stamp,
      updatedAt: stamp,
    }
  }

  function commitRecord(intent: SaveIntent, record: WeightRecord) {
    onSave(record)
    if (intent !== 'addNext' || initial) {
      onClose()
      return
    }
    setForm((prev) => ({
      ...emptyForm,
      projectId: prev.projectId,
      buildPhase: prev.buildPhase,
      level: prev.level,
      source: prev.source,
      measuredBy: prev.measuredBy,
      measuredDate: prev.measuredDate,
      weightUnit: prev.level === 'Part' ? 'g' : prev.weightUnit,
    }))
    setError(null)
    setSuccess('Submitted. Ready for the next record.')
    window.setTimeout(() => descriptionRef.current?.focus(), 0)
  }

  function handleSave(intent: SaveIntent) {
    setError(null)
    const record = buildRecord(intent)
    if (!record) return

    // Duplicate check only for brand-new records.
    if (!initial) {
      const duplicate = findPossibleDuplicate(
        {
          projectId: record.projectId,
          buildPhase: record.buildPhase,
          level: record.level,
          description: record.description,
          lenovoPn: record.lenovoPn,
          configuration: record.configuration,
        },
        records,
      )
      if (duplicate) {
        const weightLabel =
          record.weightValue == null
            ? '—'
            : `${record.weightValue} ${record.weightUnit} (${(record.weight_kg ?? 0).toFixed(3)} kg)`
        setPending({
          intent,
          record,
          duplicate,
          draft: {
            projectCode: record.projectCode,
            buildPhase: record.buildPhase,
            level: record.level,
            description: record.description,
            lenovoPn: record.lenovoPn,
            configuration: record.configuration,
            weightLabel,
            measuredDate: record.measuredDate,
            measuredBy: record.measuredBy,
          },
        })
        return
      }
    }

    commitRecord(intent, record)
  }

  function footerActions() {
    if (!initial) {
      if (prefill) {
        return (
          <>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="button secondary" onClick={() => handleSave('draft')}>
              Save Draft
            </button>
            <button type="button" className="button" onClick={() => handleSave('submit')}>
              Submit for Review
            </button>
          </>
        )
      }
      return (
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button ghost" onClick={() => handleSave('addNext')}>
            Submit & Add Next
          </button>
          <button type="button" className="button" onClick={() => handleSave('submit')}>
            Submit for Review
          </button>
        </>
      )
    }

    if (currentStatus === 'Draft') {
      return (
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button secondary" onClick={() => handleSave('draft')}>
            Save Draft
          </button>
          <button type="button" className="button" onClick={() => handleSave('submit')}>
            Submit for Review
          </button>
        </>
      )
    }

    if (currentStatus === 'Need Recheck') {
      return (
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button secondary" onClick={() => handleSave('keep')}>
            Save
          </button>
          <button type="button" className="button" onClick={() => handleSave('resubmit')}>
            Resubmit for Review
          </button>
        </>
      )
    }

    if (currentStatus === 'Verified') {
      return (
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" onClick={() => handleSave('keep')}>
            Save
          </button>
        </>
      )
    }

    return (
      <>
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
      </>
    )
  }

  return (
    <>
      <Modal title={initial ? 'Edit Weight Record' : 'Add Weight Record'} onClose={onClose} footer={footerActions()}>
        {error ? <div className="alert error">{error}</div> : null}
        {success ? <div className="alert success">{success}</div> : null}

        {currentStatus ? (
          <div className="form-status-banner">
            <span className="muted">Current status</span>
            <span className={`badge ${currentStatus.replace(/\s+/g, '-')}`}>{currentStatus}</span>
            {recheckReason ? (
              <span className="form-status-reason">
                <span className="muted">Reason:</span> {recheckReason}
              </span>
            ) : null}
            {currentStatus === 'Verified' && initial?.reviewedBy ? (
              <span className="form-status-reason">
                <span className="muted">Reviewed By:</span> {initial.reviewedBy}
                {initial.reviewedDate ? ` · ${initial.reviewedDate}` : ''}
              </span>
            ) : null}
          </div>
        ) : null}

        {currentStatus === 'Verified' ? (
          <div className="alert info form-verified-edit-note">
            Editing a verified record will require review again.
          </div>
        ) : null}

        <div className="form-grid">
          <label>
            <RequiredLabel>Project</RequiredLabel>
            <select value={form.projectId} onChange={(e) => setProject(e.target.value)}>
              <option value="">Select project…</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phase ? `${p.code} · ${p.phase}` : p.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Build / Phase
            <input
              value={form.buildPhase}
              onChange={(e) => setForm({ ...form, buildPhase: e.target.value })}
              placeholder="e.g. DV, PVT"
            />
          </label>
          <label>
            Level
            <select value={form.level} onChange={(e) => setLevel(e.target.value as Level)}>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>

          <label className="span-2">
            Description
            <input
              ref={descriptionRef}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Part / node / rack / package description"
            />
          </label>
          <label>
            Lenovo PN
            <input value={form.lenovoPn} onChange={(e) => setForm({ ...form, lenovoPn: e.target.value })} />
          </label>
          <label>
            MSFT / Customer PN
            <input value={form.customerPn} onChange={(e) => setForm({ ...form, customerPn: e.target.value })} />
          </label>
          {showPartFields ? (
            <>
              <label>
                Manufacturer
                <input
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                />
              </label>
              <label>
                Part Category
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </label>
            </>
          ) : null}
          {showPackageHint ? (
            <label className="span-2">
              Part Category
              <input
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="Packaging"
              />
            </label>
          ) : null}

          <label className="span-2">
            <RequiredLabel>Weight</RequiredLabel>
            <div className="weight-input">
              <input
                type="number"
                step="any"
                min="0"
                value={form.weightValue}
                onChange={(e) => setForm({ ...form, weightValue: e.target.value })}
              />
              <select
                aria-label="Weight unit"
                value={form.weightUnit}
                onChange={(e) => setForm({ ...form, weightUnit: e.target.value as WeightUnit })}
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
            </div>
            <small className="weight-preview">
              Converted: {convertedKg != null && Number.isFinite(convertedKg) ? `${convertedKg.toFixed(3)} kg` : '—'}
            </small>
          </label>

          <label className="span-2">
            {configRule === 'required' ? (
              <RequiredLabel>Configuration / Included Items</RequiredLabel>
            ) : (
              'Configuration / Included Items'
            )}
            <textarea
              rows={2}
              value={form.configuration}
              onChange={(e) => setForm({ ...form, configuration: e.target.value })}
              placeholder="e.g. Full rack + 8 GPU + HSK + PSU + cable, without pallet"
            />
            {configRule === 'required' && configEmpty ? (
              <small className="field-error">Please specify what is included in this rack.</small>
            ) : null}
            {configRule === 'recommended' && configEmpty ? (
              <small className="field-warn">
                Included Items is recommended. Please specify what is included to ensure an accurate weight reference.
              </small>
            ) : null}
            {configRule === 'optional' ? (
              <small className="muted">Optional for Part-level records.</small>
            ) : null}
            {form.level === 'Rack' && !configEmpty ? (
              <small className="muted">Example: Full rack + 8 GPU + HSK + PSU + cable, without pallet</small>
            ) : null}
          </label>

          <label>
            Source
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value as DataSource })}
            >
              {DATA_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className={showSupplierEmphasis ? undefined : 'soft-field'}>
            {showSupplierEmphasis ? <RequiredLabel>Supplier / Data Provider</RequiredLabel> : 'Supplier / Data Provider'}
            <input
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder="e.g. Bromake, Guangda"
            />
          </label>
          <label className={`span-2${showSupplierEmphasis ? '' : ' soft-field'}`}>
            Reference / Document Rev.
            <input
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="e.g. PKG Weight List Rev.B"
            />
          </label>

          <label>
            <RequiredLabel>Measured By</RequiredLabel>
            <input
              value={form.measuredBy}
              onChange={(e) => setForm({ ...form, measuredBy: e.target.value })}
              placeholder="Tester name"
            />
          </label>
          <label>
            <RequiredLabel>Measured Date</RequiredLabel>
            <input
              type="date"
              value={form.measuredDate}
              onChange={(e) => setForm({ ...form, measuredDate: e.target.value })}
            />
          </label>

          <label className="span-2">
            Notes
            <textarea
              rows={3}
              maxLength={500}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            <small className="muted">{form.note.length} / 500</small>
          </label>
        </div>

      </Modal>

      {pending ? (
        <DuplicateWarningModal
          existing={pending.duplicate}
          draft={pending.draft}
          onCancel={() => setPending(null)}
          onOpenExisting={() => {
            const existing = pending.duplicate
            setPending(null)
            onClose()
            onOpenExisting?.(existing)
          }}
          onSaveAnyway={() => {
            const { intent, record } = pending
            setPending(null)
            commitRecord(intent, record)
          }}
        />
      ) : null}
    </>
  )
}
