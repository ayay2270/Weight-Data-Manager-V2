import type { RecordStatus, WeightRecord } from '../data/types'
import { todayDate } from './helpers'

export type ReviewDecision = Extract<RecordStatus, 'Verified' | 'Need Recheck' | 'Rejected'>

export type ReviewResult = { ok: true; record: WeightRecord } | { ok: false; field: 'reviewer' | 'comment' | 'status'; error: string }

/**
 * Same rules as the original Review Modal: reviewer required; comment required for Need Recheck / Reject;
 * only Pending Review records can be reviewed. Review fields are the only fields changed.
 */
export function applyReview(
  record: WeightRecord,
  status: ReviewDecision,
  reviewer: string,
  comment: string,
  date: string = todayDate(),
): ReviewResult {
  if (record.status !== 'Pending Review') {
    return { ok: false, field: 'status', error: 'Only Pending Review records can be reviewed.' }
  }
  if (!reviewer.trim()) return { ok: false, field: 'reviewer', error: 'Reviewer is required.' }
  if ((status === 'Need Recheck' || status === 'Rejected') && !comment.trim()) {
    return { ok: false, field: 'comment', error: 'Review Comment is required for Need Recheck or Reject.' }
  }
  return {
    ok: true,
    record: {
      ...record,
      status,
      reviewedBy: reviewer.trim(),
      reviewedDate: date,
      reviewComment: comment.trim() || null,
    },
  }
}
