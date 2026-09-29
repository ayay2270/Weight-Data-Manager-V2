import { createContext, useContext } from 'react'
import type { WeightRecord } from '../data/types'

export interface RecordActions {
  /** Open the Record Detail sheet. */
  view: (record: WeightRecord) => void
  /** Edit / Update Measurement (Draft, Need Recheck, Verified only — same as the original). */
  edit: (record: WeightRecord) => void
  /** Duplicate opens the form prefilled; nothing is saved until the user submits. */
  duplicate: (record: WeightRecord) => void
  /** Delete — Draft records only, after confirmation. */
  remove: (record: WeightRecord) => void
  /** Open the review session focused on this record (Pending Review only). */
  review: (record: WeightRecord) => void
}

export const RecordActionsContext = createContext<RecordActions | null>(null)

export function useRecordActions(): RecordActions {
  const ctx = useContext(RecordActionsContext)
  if (!ctx) throw new Error('useRecordActions must be used within RecordActionsProvider')
  return ctx
}
