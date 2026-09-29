import { useEffect } from 'react'
import { Check, Copy, Pencil, Trash2, X } from 'lucide-react'
import type { WeightRecord } from '../data/types'
import { useData } from '../hooks/useData'
import { canEditMeasurement, formatWeightKg, getWeightKg } from '../utils/helpers'
import { StatusBadge } from './ui'

interface RecordDetailDrawerProps {
  record: WeightRecord | null
  onClose: () => void
  onEdit?: (record: WeightRecord) => void
  onReview?: (record: WeightRecord) => void
  onDuplicate?: (record: WeightRecord) => void
  onDelete?: (record: WeightRecord) => void
}

function Row({ label, value }: { label: string; value?: string | null }) {
  const display = value?.trim() ? value : '—'
  return (
    <div className="drawer-row">
      <dt>{label}</dt>
      <dd title={display}>{display}</dd>
    </div>
  )
}

function normPn(value?: string | null) {
  return (value || '').replace(/\s+/g, '').toLowerCase()
}

export function RecordDetailDrawer({ record, onClose, onEdit, onReview, onDuplicate, onDelete }: RecordDetailDrawerProps) {
  const { records } = useData()

  useEffect(() => {
    if (!record) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [record, onClose])

  if (!record) return null

  const isPending = record.status === 'Pending Review'
  const canEdit = canEditMeasurement(record.status)
  const pn = normPn(record.lenovoPn)
  const related = records.filter(
    (r) => r.id !== record.id && ((pn && normPn(r.lenovoPn) === pn) || (r.description && r.description === record.description)),
  )
  const kg = getWeightKg(record)

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="record-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Weight Record Details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="record-drawer-head">
          <StatusBadge status={record.status} />
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        <div className="record-drawer-body">
          <p className="eyebrow">
            {record.projectCode} · {record.level}
            {record.lenovoPn ? ` · ${record.lenovoPn}` : ''}
          </p>
          <h2>{record.description || 'Untitled'}</h2>
          <div className="weight-hero">
            <strong>
              {record.weightValue == null ? '—' : +record.weightValue.toFixed(3)}
              <small>{record.weightValue == null ? 'no weight recorded' : record.weightUnit}</small>
            </strong>
            <span className="muted">{kg == null ? '' : `${formatWeightKg(record)} stored`}</span>
          </div>

          {record.status === 'Need Recheck' || record.status === 'Rejected' ? (
            <div className="callout terra">
              <strong>
                {record.status === 'Rejected' ? 'Rejected' : 'Returned for recheck'} · {record.reviewedBy || '—'}
                {record.reviewedDate ? `, ${record.reviewedDate}` : ''}
              </strong>
              {record.reviewComment || 'No comment.'}
            </div>
          ) : null}
          {record.status === 'Verified' ? (
            <div className="callout moss">
              <strong>
                Verified · {record.reviewedBy || '—'}
                {record.reviewedDate ? `, ${record.reviewedDate}` : ''}
              </strong>
              {record.reviewComment || 'No comment.'} Editing a verified record sends it back to review.
            </div>
          ) : null}

          <section>
            <h3>Measurement Information</h3>
            <dl className="drawer-dl">
              <Row label="Project" value={record.projectCode} />
              <Row label="Build Phase" value={record.buildPhase} />
              <Row label="Level" value={record.level} />
              <Row label="Description" value={record.description} />
              <Row label="Lenovo PN" value={record.lenovoPn} />
              <Row label="MSFT PN" value={record.customerPn} />
              <Row label="Part Category" value={record.category} />
              <Row label="Manufacturer" value={record.manufacturer} />
              <Row label="Weight" value={formatWeightKg(record)} />
              <Row label="Configuration" value={record.configuration} />
              <Row label="Source" value={record.source} />
              <Row label="Supplier / Data Provider" value={record.supplier} />
              <Row label="Reference / Document Rev." value={record.reference} />
              <Row label="Measured By" value={record.measuredBy} />
              <Row label="Measured Date" value={record.measuredDate} />
              <Row label="Notes" value={record.note} />
            </dl>
          </section>

          <section>
            <h3>Review Information</h3>
            <dl className="drawer-dl">
              <div className="drawer-row">
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={record.status} compact />
                </dd>
              </div>
              <Row label="Reviewed By" value={record.reviewedBy} />
              <Row label="Reviewed Date" value={record.reviewedDate} />
              <Row label="Review Comment" value={record.reviewComment} />
            </dl>
          </section>

          {related.length ? (
            <section>
              <h3>Same part elsewhere</h3>
              <ul className="compare-list">
                {related.map((r) => (
                  <li key={r.id}>
                    <span>
                      <strong>{r.projectCode}</strong> {r.buildPhase || ''} <StatusBadge status={r.status} compact />
                    </span>
                    <b>{formatWeightKg(r)}</b>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="record-drawer-foot">
          {record.status === 'Draft' && onDelete ? (
            <button type="button" className="button ghost danger-text" onClick={() => onDelete(record)}>
              <Trash2 size={15} /> Delete draft
            </button>
          ) : null}
          {onDuplicate ? (
            <button type="button" className="button secondary" onClick={() => onDuplicate(record)}>
              <Copy size={15} /> Duplicate
            </button>
          ) : null}
          {isPending && onReview ? (
            <button type="button" className="button terra" onClick={() => onReview(record)}>
              <Check size={15} /> Review
            </button>
          ) : null}
          {canEdit && onEdit ? (
            <button type="button" className="button" onClick={() => onEdit(record)}>
              <Pencil size={15} /> {record.status === 'Need Recheck' ? 'Update Measurement' : 'Edit Record'}
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  )
}
