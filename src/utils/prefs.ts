/**
 * V2 UI preferences. Stored under separate `wdm.v2.*` keys so the shared app data
 * (`wdm.v1.appData`) and the original app's own UI keys are never rewritten.
 */
export const PREF_KEYS = {
  savedViews: 'wdm.v2.recordViews',
  visibleColumns: 'wdm.v2.visibleColumns',
  descriptionWidth: 'wdm.v2.descriptionWidth',
  pinnedProjects: 'wdm.v2.pinnedProjects',
  openGroups: 'wdm.v2.openGroups',
  groupBy: 'wdm.v2.groupBy',
  lastMeasuredBy: 'wdm.v2.lastMeasuredBy',
  lastReviewer: 'wdm.v2.lastReviewer',
} as const

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / privacy-mode failures
  }
}
