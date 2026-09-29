import type { Project, WeightRecord } from '../data/types'

export interface ProjectOption {
  project: Project
  pinned: boolean
  lastActivity: string
}

export interface ProjectOptionList {
  items: ProjectOption[]
  /** Projects not listed (only when not searching). */
  hiddenCount: number
}

/** Most recent record update (or project update) — used to rank "recent" projects. */
export function projectActivity(projects: Project[], records: WeightRecord[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of projects) out.set(p.id, p.updatedAt || '')
  for (const r of records) {
    const current = out.get(r.projectId) || ''
    if ((r.updatedAt || '') > current) out.set(r.projectId, r.updatedAt)
  }
  return out
}

/**
 * Keeps the sidebar Project facet short no matter how many projects exist.
 * Without a search: pinned first, then any currently selected, then active projects by recent activity — capped at `limit`.
 * With a search: every matching project (code, phase, notes), capped at `searchLimit`.
 */
export function projectFacetOptions(
  projects: Project[],
  records: WeightRecord[],
  opts: { pinned: string[]; selectedCodes: string[]; search: string; limit?: number; searchLimit?: number },
): ProjectOptionList {
  const limit = opts.limit ?? 6
  const searchLimit = opts.searchLimit ?? 12
  const activity = projectActivity(projects, records)
  const pinned = new Set(opts.pinned)
  const toOption = (p: Project): ProjectOption => ({ project: p, pinned: pinned.has(p.id), lastActivity: activity.get(p.id) || '' })
  const byRecent = (a: Project, b: Project) => (activity.get(b.id) || '').localeCompare(activity.get(a.id) || '') || a.code.localeCompare(b.code)

  const q = opts.search.trim().toLowerCase()
  if (q) {
    const matches = projects
      .filter((p) => [p.code, p.phase, p.notes].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => Number(pinned.has(b.id)) - Number(pinned.has(a.id)) || byRecent(a, b))
    return { items: matches.slice(0, searchLimit).map(toOption), hiddenCount: Math.max(0, matches.length - searchLimit) }
  }

  const picked: Project[] = []
  const add = (p?: Project) => {
    if (p && !picked.includes(p)) picked.push(p)
  }
  projects.filter((p) => pinned.has(p.id)).sort(byRecent).forEach(add)
  for (const code of opts.selectedCodes) add(projects.find((p) => p.code === code))
  projects
    .filter((p) => p.status === 'Active')
    .sort(byRecent)
    .forEach((p) => {
      if (picked.length < limit) add(p)
    })
  return { items: picked.map(toOption), hiddenCount: Math.max(0, projects.length - picked.length) }
}
