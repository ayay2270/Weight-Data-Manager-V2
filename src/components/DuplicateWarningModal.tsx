import { AlertTriangle } from 'lucide-react'
import type { WeightRecord } from '../data/types'
import { formatWeightKg } from '../utils/helpers'
import { Modal } from './Modal'

export type DuplicateDraft = {
  projectCode: string
  buildPhase?: string | null
  level: string
  description: string
  lenovoPn?: string | null
  configuration?: string | null
  weightLabel: string
  measuredDate?: string | null
  measuredBy?: string | null
}

interface DuplicateWarningModalProps {
  existing: WeightRecord
  draft: DuplicateDraft
  onCancel: () => void
  onOpenExisting: () => void
  onSaveAnyway: () => void
}

const ROWS: Array<{ key: keyof DuplicateDraft | 'weight'; label: string; existing: (r: WeightRecord) => string; draft: (d: DuplicateDraft) => string }> = [
  { key: 'projectCode', label: 'Project', existing: (r) => r.projectCode || '—', draft: (d) => d.projectCode || '—' },
  { key: 'buildPhase', label: 'Build Phase', existing: (r) => r.buildPhase || '—', draft: (d) => d.buildPhase || '—' },
  { key: 'level', label: 'Level', existing: (r) => r.level, draft: (d) => d.level },
  { key: 'description', label: 'Description', existing: (r) => r.description || '—', draft: (d) => d.description || '—' },
  { key: 'lenovoPn', label: 'Lenovo PN', existing: (r) => r.lenovoPn || '—', draft: (d) => d.lenovoPn || '—' },
  { key: 'configuration', label: 'Configuration', existing: (r) => r.configuration || '—', draft: (d) => d.configuration || '—' },
  { key: 'weight', label: 'Weight', existing: (r) => formatWeightKg(r), draft: (d) => d.weightLabel },
  { key: 'measuredDate', label: 'Measured Date', existing: (r) => r.measuredDate || '—', draft: (d) => d.measuredDate || '—' },
  { key: 'measuredBy', label: 'Measured By', existing: (r) => r.measuredBy || '—', draft: (d) => d.measuredBy || '—' },
]

export function DuplicateWarningModal({
  existing,
  draft,
  onCancel,
  onOpenExisting,
  onSaveAnyway,
}: DuplicateWarningModalProps) {
  return (
    <Modal
      title="Possible Duplicate Record"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button secondary" onClick={onOpenExisting}>
            Open Existing
          </button>
          <button type="button" className="button" onClick={onSaveAnyway}>
            Save Anyway
          </button>
        </>
      }
    >
      <div className="duplicate-warning-head">
        <AlertTriangle size={18} />
        <p>
          This might be a duplicate record. Please confirm whether you want to save this record, open the existing
          record, or cancel.
        </p>
      </div>
      <div className="duplicate-compare">
        <div className="duplicate-compare-col">
          <h3>Existing Record</h3>
          <dl>
            {ROWS.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.existing(existing)}>{row.existing(existing)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="duplicate-compare-col">
          <h3>New Record (Current Input)</h3>
          <dl>
            {ROWS.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.draft(draft)}>{row.draft(draft)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Modal>
  )
}
