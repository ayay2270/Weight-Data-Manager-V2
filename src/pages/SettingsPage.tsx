import { useRef, useState } from 'react'
import {
  AlertTriangle,
  Clock3,
  Database,
  Download,
  Info,
  Upload,
} from 'lucide-react'
import { Modal } from '../components/Modal'
import { PageHeader } from '../components/PageHeader'
import { useData } from '../hooks/useData'
import { downloadBlob } from '../utils/helpers'
import { exportBackupJson, importBackupJson } from '../utils/storage'

const LAST_BACKUP_KEY = 'wdm.v1.lastBackupAt'

type ConfirmAction = 'restore-backup' | 'restore-demo' | null

function readLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

function formatBackupTime(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Never'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SettingsPage() {
  const { resetDemoData, replaceData, data } = useData()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt())
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [pendingBackupFile, setPendingBackupFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function downloadBackup() {
    downloadBlob(exportBackupJson(data), `wdm-backup-${new Date().toISOString().slice(0, 10)}.json`)
    const stamp = new Date().toISOString()
    try {
      localStorage.setItem(LAST_BACKUP_KEY, stamp)
    } catch {
      // ignore storage write failures
    }
    setLastBackupAt(stamp)
    setError(null)
    setMessage('Full backup downloaded.')
  }

  async function restoreBackup(file: File) {
    try {
      const text = await file.text()
      replaceData(importBackupJson(text))
      setError(null)
      setMessage('Full backup restored into LocalStorage.')
    } catch {
      setMessage(null)
      setError('Could not restore backup. Use a JSON file exported from this app.')
    }
  }

  function restoreDemo() {
    resetDemoData()
    setError(null)
    setMessage('Demo data restored from X01 seed.')
  }

  function closeConfirm() {
    setConfirmAction(null)
    setPendingBackupFile(null)
  }

  async function confirmActionProceed() {
    if (confirmAction === 'restore-backup' && pendingBackupFile) {
      await restoreBackup(pendingBackupFile)
      closeConfirm()
      return
    }
    if (confirmAction === 'restore-demo') {
      restoreDemo()
      closeConfirm()
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage local data backup and recovery."
        actions={<span className="muted">Local data is stored in this browser only.</span>}
      />
      <div className="content">
        {message ? <div className="alert success">{message}</div> : null}
        {error ? <div className="alert error">{error}</div> : null}

        <div className="settings-layout">
          <div className="settings-main">
            <div className="panel">
              <div className="panel-head settings-section-head">
                <div className="settings-section-title">
                  <span className="settings-icon backup">
                    <Database size={16} />
                  </span>
                  <div>
                    <h2>Data Backup</h2>
                    <p>Backup or restore all local data stored in this browser.</p>
                  </div>
                </div>
              </div>

              <div className="alert info">
                <Info size={16} />
                <div>
                  The backup includes all projects, weight records, and local settings. Use it to transfer your data
                  between computers or as a safety backup. GitHub sync only updates the app code — it does not sync
                  LocalStorage data.
                </div>
              </div>

              <div className="settings-actions">
                <button type="button" className="button" onClick={downloadBackup}>
                  <Download size={16} /> Download Full Backup (.json)
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setPendingBackupFile(file)
                    setConfirmAction('restore-backup')
                    e.target.value = ''
                  }}
                />
                <button type="button" className="button secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} /> Restore Full Backup
                </button>
              </div>

              <div className="settings-meta muted">
                <Clock3 size={14} />
                Last backup: {formatBackupTime(lastBackupAt)}
              </div>
            </div>

            <div className="panel danger-zone">
              <div className="panel-head settings-section-head">
                <div className="settings-section-title">
                  <span className="settings-icon danger">
                    <AlertTriangle size={16} />
                  </span>
                  <div>
                    <h2>Danger Zone</h2>
                    <p>Demo and reset tools. Use with caution.</p>
                  </div>
                </div>
              </div>

              <div className="alert error">
                <AlertTriangle size={16} />
                <div>
                  <strong>Restore Demo Data</strong>
                  <p>
                    This will replace all current data with the sample dataset (Weight Measurement Record_X01.xlsx).
                    Your current projects, records, and settings will be permanently replaced.
                  </p>
                </div>
              </div>

              <button type="button" className="button danger" onClick={() => setConfirmAction('restore-demo')}>
                Restore Demo Data
              </button>
            </div>
          </div>

          <aside className="settings-aside">
            <div className="panel tips-panel">
              <div className="panel-head">
                <h2>About Data Backup</h2>
              </div>
              <ul>
                <li>Includes projects, weight records, and local settings.</li>
                <li>Keep the downloaded JSON file in a safe place.</li>
                <li>Data stays in this browser LocalStorage and is not synced automatically.</li>
              </ul>
            </div>
            <div className="panel tips-panel">
              <div className="panel-head">
                <h2>About Demo Data</h2>
              </div>
              <ul>
                <li>Restoring demo data replaces everything currently stored locally.</li>
                <li>This action cannot be undone without a backup file.</li>
                <li>Use it for testing or returning to the sample dataset.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>

      {confirmAction === 'restore-backup' ? (
        <Modal
          title="Restore Backup"
          onClose={closeConfirm}
          footer={
            <>
              <button type="button" className="button secondary" onClick={closeConfirm}>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={confirmActionProceed}>
                Restore
              </button>
            </>
          }
        >
          <p>
            This will replace the current local data with the selected backup, including projects, weight records, and
            settings.
          </p>
          {pendingBackupFile ? <p className="muted">File: {pendingBackupFile.name}</p> : null}
        </Modal>
      ) : null}

      {confirmAction === 'restore-demo' ? (
        <Modal
          title="Restore Demo Data"
          onClose={closeConfirm}
          footer={
            <>
              <button type="button" className="button secondary" onClick={closeConfirm}>
                Cancel
              </button>
              <button type="button" className="button danger" onClick={confirmActionProceed}>
                Restore Demo Data
              </button>
            </>
          }
        >
          <p>
            This will permanently replace your current projects, weight records, and local settings with the sample
            dataset from Weight Measurement Record_X01.xlsx.
          </p>
        </Modal>
      ) : null}
    </>
  )
}
