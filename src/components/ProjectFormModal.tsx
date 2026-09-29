import { useState } from 'react'
import type { Project } from '../data/types'
import { useData } from '../hooks/useData'
import { nowIso, uid } from '../utils/helpers'
import { Modal } from './Modal'

/** Same create / edit semantics as the original Projects page (code required; Active / Archived status; notes). */
export function ProjectFormModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved?: (p: Project) => void }) {
  const { projects, upsertProject } = useData()
  const [form, setForm] = useState({
    code: project?.code || '',
    phase: project?.phase || '',
    status: (project?.status || 'Active') as Project['status'],
    notes: project?.notes || '',
  })
  const [error, setError] = useState<string | null>(null)

  function save() {
    const code = form.code.trim()
    if (!code) {
      setError('Project code is required.')
      return
    }
    if (projects.some((p) => p.id !== project?.id && p.code.toLowerCase() === code.toLowerCase())) {
      setError('A project with this code already exists.')
      return
    }
    const stamp = nowIso()
    const next: Project = {
      id: project?.id || uid('prj'),
      code,
      phase: form.phase.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      createdAt: project?.createdAt || stamp,
      updatedAt: stamp,
    }
    if (project?.name) next.name = project.name
    upsertProject(next)
    onSaved?.(next)
    onClose()
  }

  return (
    <Modal
      title={project ? `Edit ${project.code}` : 'New project'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button" onClick={save}>
            Save project
          </button>
        </>
      }
    >
      {error ? (
        <div className="alert error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-grid">
        <label>
          <span className="required-label">
            <span className="required-mark" aria-hidden="true">
              *
            </span>
            Project code
          </span>
          <input autoFocus value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </label>
        <label>
          Status
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Project['status'] })}>
            <option value="Active">Active</option>
            <option value="Archived">Archived</option>
          </select>
        </label>
        <label>
          Phase
          <input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} placeholder="e.g. DV" />
        </label>
        <label>
          Notes
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </label>
      </div>
      {project && project.code !== form.code.trim() && form.code.trim() ? (
        <p className="muted small-text">Renaming updates the project code on all of this project’s records.</p>
      ) : null}
    </Modal>
  )
}
