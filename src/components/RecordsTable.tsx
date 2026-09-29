import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, EllipsisVertical, Eye, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import type { WeightRecord } from '../data/types'
import { useRecordActions } from '../hooks/recordActions'
import { canEditMeasurement, getWeightKg } from '../utils/helpers'
import type { SortDirection, SortKey } from '../utils/recordFilters'
import { COLUMN_OPTIONS, type ColumnKey } from '../utils/recordViews'
import { StatusBadge } from './ui'

export const MIN_DESCRIPTION_WIDTH = 160
export const MAX_DESCRIPTION_WIDTH = 640

interface RecordsTableProps {
  records: WeightRecord[]
  columns: ColumnKey[]
  sortKey: SortKey | null
  sortDirection: SortDirection | null
  onSort: (key: SortKey) => void
  descriptionWidth: number
  onDescriptionWidth: (width: number, done: boolean) => void
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: (ids: string[], select: boolean) => void
  caption: string
}

function text(value?: string | null) {
  return value?.trim() ? value : '—'
}

/** Paired part numbers ("A/B") may wrap after the slash only; single PNs never break. */
function pn(value?: string | null) {
  return value?.trim() ? value.replace(/\//g, '/\u200b') : '—'
}

function RowMenu({ record }: { record: WeightRecord }) {
  const actions = useRecordActions()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  const run = (fn: (r: WeightRecord) => void) => () => {
    setOpen(false)
    fn(record)
  }
  return (
    <div className="row-menu" ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-label={`Actions for ${record.description || record.id}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <EllipsisVertical size={16} />
      </button>
      {open ? (
        <div className="menu" role="menu" onClick={(e) => e.stopPropagation()}>
          <button type="button" role="menuitem" onClick={run(actions.view)}>
            <Eye size={15} /> View details
          </button>
          {record.status === 'Pending Review' ? (
            <button type="button" role="menuitem" onClick={run(actions.review)}>
              <Check size={15} /> Review
            </button>
          ) : null}
          {canEditMeasurement(record.status) ? (
            <button type="button" role="menuitem" onClick={run(actions.edit)}>
              {record.status === 'Need Recheck' ? <RotateCcw size={15} /> : <Pencil size={15} />}
              {record.status === 'Need Recheck' ? 'Update measurement' : 'Edit'}
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={run(actions.duplicate)}>
            <Copy size={15} /> Duplicate
          </button>
          {record.status === 'Draft' ? (
            <button type="button" role="menuitem" className="danger-text" onClick={run(actions.remove)}>
              <Trash2 size={15} /> Delete draft
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Cell({ record, column }: { record: WeightRecord; column: ColumnKey }) {
  switch (column) {
    case 'description':
      return null
    case 'project':
      return <td className="nowrap strong">{record.projectCode || '—'}</td>
    case 'weight': {
      const kg = getWeightKg(record)
      return <td className="num">{kg == null ? <span className="muted">—</span> : kg.toFixed(3)}</td>
    }
    case 'status':
      return (
        <td>
          <StatusBadge status={record.status} compact />
        </td>
      )
    case 'measuredDate':
      return <td className="nowrap">{text(record.measuredDate)}</td>
    case 'updated':
      return <td className="nowrap">{(record.updatedAt || '').slice(0, 10) || '—'}</td>
    case 'configuration':
    case 'reviewComment':
    case 'note':
    case 'reference': {
      const value = column === 'configuration' ? record.configuration : column === 'reviewComment' ? record.reviewComment : column === 'note' ? record.note : record.reference
      return (
        <td className="clip" title={value || undefined}>
          {text(value)}
        </td>
      )
    }
    case 'lenovoPn':
      return <td className="mono">{pn(record.lenovoPn)}</td>
    case 'customerPn':
      return <td className="mono">{pn(record.customerPn)}</td>
    case 'level':
      return <td>{record.level}</td>
    case 'buildPhase':
      return <td>{text(record.buildPhase)}</td>
    case 'source':
      return <td>{record.source}</td>
    case 'measuredBy':
      return <td>{text(record.measuredBy)}</td>
    case 'reviewedBy':
      return <td>{text(record.reviewedBy)}</td>
    case 'manufacturer':
      return <td>{text(record.manufacturer)}</td>
    case 'category':
      return <td>{text(record.category)}</td>
    case 'supplier':
      return <td>{text(record.supplier)}</td>
  }
}

export function RecordsTable({
  records,
  columns,
  sortKey,
  sortDirection,
  onSort,
  descriptionWidth,
  onDescriptionWidth,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  caption,
}: RecordsTableProps) {
  const actions = useRecordActions()
  const resizing = useRef(false)
  const ordered = COLUMN_OPTIONS.filter((c) => columns.includes(c.key))
  const ids = records.map((r) => r.id)
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
  const someSelected = !allSelected && ids.some((id) => selectedIds.has(id))

  function startResize(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const start = descriptionWidth
    resizing.current = false
    document.body.classList.add('col-resizing')
    const clamp = (x: number) => Math.min(MAX_DESCRIPTION_WIDTH, Math.max(MIN_DESCRIPTION_WIDTH, start + x - startX))
    const onMove = (e: PointerEvent) => {
      if (Math.abs(e.clientX - startX) > 2) resizing.current = true
      onDescriptionWidth(clamp(e.clientX), false)
    }
    const onUp = (e: PointerEvent) => {
      onDescriptionWidth(clamp(e.clientX), true)
      document.body.classList.remove('col-resizing')
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      window.setTimeout(() => {
        resizing.current = false
      }, 0)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  const sortIcon = (key?: SortKey) =>
    !key || sortKey !== key ? <ArrowUpDown size={12} /> : sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />

  return (
    <div className="table-scroll">
      <table className="records-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th className="select-col">
              <input
                type="checkbox"
                aria-label={`Select all ${records.length} records in ${caption}`}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected
                }}
                onChange={() => onToggleAll(ids, !allSelected)}
              />
            </th>
            {ordered.map((col) => {
              const ariaSort = col.sortKey && sortKey === col.sortKey ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined
              const label = col.sortKey ? (
                <button
                  type="button"
                  className="sort-header"
                  onClick={() => {
                    if (!resizing.current && col.sortKey) onSort(col.sortKey)
                  }}
                >
                  {col.label} {sortIcon(col.sortKey)}
                </button>
              ) : (
                col.label
              )
              if (col.key === 'description') {
                return (
                  <th key={col.key} aria-sort={ariaSort} className="desc-col" style={{ width: descriptionWidth, minWidth: descriptionWidth, maxWidth: descriptionWidth }}>
                    <div className="resizable-header">
                      {label}
                      <span
                        className="col-resize-handle"
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize Description column (arrow keys)"
                        tabIndex={0}
                        onPointerDown={startResize}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                          e.preventDefault()
                          const next = Math.min(MAX_DESCRIPTION_WIDTH, Math.max(MIN_DESCRIPTION_WIDTH, descriptionWidth + (e.key === 'ArrowRight' ? 20 : -20)))
                          onDescriptionWidth(next, true)
                        }}
                      />
                    </div>
                  </th>
                )
              }
              return (
                <th key={col.key} aria-sort={ariaSort} className={col.key === 'weight' ? 'num' : undefined}>
                  {label}
                </th>
              )
            })}
            <th className="actions-col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const selected = selectedIds.has(record.id)
            return (
              <tr key={record.id} className={selected ? 'selected' : undefined} onClick={() => actions.view(record)}>
                <td className="select-col" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${record.description || record.id}`}
                    checked={selected}
                    onChange={() => onToggleSelect(record.id)}
                  />
                </td>
                {ordered.map((col) =>
                  col.key === 'description' ? (
                    <td key={col.key} className="desc-col" style={{ width: descriptionWidth, maxWidth: descriptionWidth }} title={record.description || undefined}>
                      <button
                        type="button"
                        className="desc-link"
                        onClick={(e) => {
                          e.stopPropagation()
                          actions.view(record)
                        }}
                      >
                        {record.description || 'Untitled'}
                      </button>
                    </td>
                  ) : (
                    <Cell key={col.key} record={record} column={col.key} />
                  ),
                )}
                <td className="actions-col" onClick={(e) => e.stopPropagation()}>
                  <RowMenu record={record} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
