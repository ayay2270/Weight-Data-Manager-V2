import { CheckCircle2, Clock3, PencilLine, RotateCcw, XCircle, type LucideIcon } from 'lucide-react'
import type { RecordStatus, WeightRecord } from '../data/types'
import { RECORD_STATUSES } from '../data/types'
import { statusBadgeClass } from '../utils/helpers'
import { statusCounts } from '../utils/recordFilters'

const STATUS_ICON: Record<RecordStatus, LucideIcon> = {
  Draft: PencilLine,
  'Pending Review': Clock3,
  'Need Recheck': RotateCcw,
  Verified: CheckCircle2,
  Rejected: XCircle,
}

/** Status is always shown as icon + text + tone, never colour alone. */
export function StatusBadge({ status, compact }: { status: RecordStatus; compact?: boolean }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={`status status-${statusBadgeClass(status)}${compact ? ' compact' : ''}`}>
      <Icon size={13} aria-hidden="true" />
      {status}
    </span>
  )
}

export function StatusDot({ status }: { status: RecordStatus }) {
  return <span className={`dot dot-${statusBadgeClass(status)}`} aria-hidden="true" />
}

/** Segmented bar of status distribution. Order: Verified, Pending, Recheck, Draft, Rejected. */
const BAR_ORDER: RecordStatus[] = ['Verified', 'Pending Review', 'Need Recheck', 'Draft', 'Rejected']
export function StatusBar({ records, width = 150 }: { records: WeightRecord[]; width?: number }) {
  const counts = statusCounts(records)
  const total = records.length || 1
  const label = RECORD_STATUSES.filter((s) => counts[s]).map((s) => `${counts[s]} ${s}`).join(', ')
  return (
    <span className="status-bar" style={{ width }} role="img" aria-label={label || 'No records'}>
      {BAR_ORDER.map((s) =>
        counts[s] ? <i key={s} className={`seg-${statusBadgeClass(s)}`} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${s}: ${counts[s]}`} /> : null,
      )}
    </span>
  )
}

export function ProgressRing({ value, size = 72, label = 'verified' }: { value: number; size?: number; label?: string }) {
  const r = size / 2 - 6
  const c = 2 * Math.PI * r
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <span className="ring" style={{ width: size, height: size }} role="img" aria-label={`${pct}% ${label}`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-value" strokeDasharray={`${c * (pct / 100)} ${c}`} />
      </svg>
      <span className="ring-label">
        {pct}%<small>{label}</small>
      </span>
    </span>
  )
}
