import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { WeightRecord } from '../data/types'
import { useData } from '../hooks/useData'
import { RecordActionsContext, type RecordActions } from '../hooks/recordActions'
import { canEditMeasurement } from '../utils/helpers'
import { Modal } from './Modal'
import { RecordDetailDrawer } from './RecordDetailDrawer'
import { RecordFormModal } from './RecordFormModal'

type FormState = { mode: 'edit' | 'duplicate'; record: WeightRecord } | null

export function RecordActionsProvider({ children }: { children: ReactNode }) {
  const { projects, records, settings, upsertRecord, deleteRecord } = useData()
  const navigate = useNavigate()
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(null)
  const [deleting, setDeleting] = useState<WeightRecord | null>(null)

  const view = useCallback((record: WeightRecord) => setViewingId(record.id), [])
  const edit = useCallback((record: WeightRecord) => {
    if (!canEditMeasurement(record.status)) return
    setViewingId(null)
    setForm({ mode: 'edit', record })
  }, [])
  const duplicate = useCallback((record: WeightRecord) => {
    setViewingId(null)
    setForm({ mode: 'duplicate', record })
  }, [])
  const remove = useCallback((record: WeightRecord) => {
    if (record.status !== 'Draft') return
    setDeleting(record)
  }, [])
  const review = useCallback(
    (record: WeightRecord) => {
      setViewingId(null)
      navigate(`/review?id=${encodeURIComponent(record.id)}`)
    },
    [navigate],
  )

  const actions = useMemo<RecordActions>(() => ({ view, edit, duplicate, remove, review }), [view, edit, duplicate, remove, review])
  // Always show the latest stored version of the record being viewed.
  const viewing = viewingId ? records.find((r) => r.id === viewingId) || null : null

  return (
    <RecordActionsContext.Provider value={actions}>
      {children}
      <RecordDetailDrawer
        record={viewing}
        onClose={() => setViewingId(null)}
        onEdit={edit}
        onReview={review}
        onDuplicate={duplicate}
        onDelete={remove}
      />
      <RecordFormModal
        open={Boolean(form)}
        projects={projects}
        records={records}
        initial={form?.mode === 'edit' ? form.record : null}
        prefill={form?.mode === 'duplicate' ? form.record : null}
        defaultProjectId={settings.defaultProjectId}
        defaultUnit={settings.defaultUnit}
        onClose={() => setForm(null)}
        onSave={upsertRecord}
        onOpenExisting={(record) => {
          setForm(null)
          setViewingId(record.id)
        }}
      />
      {deleting ? (
        <Modal
          title="Delete draft record?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="button secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button danger"
                onClick={() => {
                  deleteRecord(deleting.id)
                  if (viewingId === deleting.id) setViewingId(null)
                  setDeleting(null)
                }}
              >
                Delete draft
              </button>
            </>
          }
        >
          <p>
            “{deleting.description || 'Untitled'}” will be removed from this browser. Only Draft records can be deleted.
          </p>
        </Modal>
      ) : null}
    </RecordActionsContext.Provider>
  )
}
