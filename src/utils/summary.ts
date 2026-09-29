import type { WeightRecord } from '../data/types'
import { statusCounts } from './recordFilters'

/** e.g. "22 records · 10 verified · 8 pending · 2 recheck" */
export function summaryLine(records: WeightRecord[]): string {
  const c = statusCounts(records)
  const parts = [`${records.length} record${records.length === 1 ? '' : 's'}`, `${c.Verified} verified`]
  if (c['Pending Review']) parts.push(`${c['Pending Review']} pending`)
  if (c['Need Recheck']) parts.push(`${c['Need Recheck']} recheck`)
  if (c.Draft) parts.push(`${c.Draft} draft`)
  if (c.Rejected) parts.push(`${c.Rejected} rejected`)
  return parts.join(' · ')
}
