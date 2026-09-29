const EXPORT_CONTEXT_KEY = 'wdm.v1.exportContext'

export type ExportContext = {
  orderedFilteredRecordIds: string[]
  visibleColumns: string[]
  selectedIds: string[]
  updatedAt: string
}

export function saveExportContext(
  orderedFilteredRecordIds: string[],
  visibleColumns: string[],
  selectedIds: string[],
): void {
  const payload: ExportContext = {
    orderedFilteredRecordIds,
    visibleColumns,
    selectedIds,
    updatedAt: new Date().toISOString(),
  }
  try {
    sessionStorage.setItem(EXPORT_CONTEXT_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / privacy mode failures
  }
}

export function loadExportContext(): ExportContext {
  const empty: ExportContext = {
    orderedFilteredRecordIds: [],
    visibleColumns: [],
    selectedIds: [],
    updatedAt: '',
  }
  try {
    const raw = sessionStorage.getItem(EXPORT_CONTEXT_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<ExportContext> & { filteredIds?: string[] }
    const ordered = Array.isArray(parsed.orderedFilteredRecordIds)
      ? parsed.orderedFilteredRecordIds
      : Array.isArray(parsed.filteredIds)
        ? parsed.filteredIds
        : []
    return {
      orderedFilteredRecordIds: ordered,
      visibleColumns: Array.isArray(parsed.visibleColumns) ? parsed.visibleColumns : [],
      selectedIds: Array.isArray(parsed.selectedIds) ? parsed.selectedIds : [],
      updatedAt: parsed.updatedAt || '',
    }
  } catch {
    return empty
  }
}
