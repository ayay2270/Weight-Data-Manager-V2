import type { Level, WeightRecord } from '../data/types'

function norm(value?: string | null): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export type DuplicateCandidate = {
  projectId: string
  buildPhase?: string | null
  level: Level
  description: string
  lenovoPn?: string | null
  configuration?: string | null
}

/**
 * Warning-only duplicate check.
 * With a Lenovo PN: same project + PN + level is required, and build phase,
 * description, or configuration must also agree.
 * Without a PN: same project + level + description + configuration.
 */
export function findPossibleDuplicate(
  candidate: DuplicateCandidate,
  records: WeightRecord[],
  excludeId?: string | null,
): WeightRecord | null {
  const projectId = candidate.projectId
  if (!projectId) return null

  const pn = norm(candidate.lenovoPn)
  const description = norm(candidate.description)
  const buildPhase = norm(candidate.buildPhase)
  const configuration = norm(candidate.configuration)

  let best: WeightRecord | null = null
  let bestScore = 0

  for (const record of records) {
    if (excludeId && record.id === excludeId) continue
    if (record.projectId !== projectId || record.level !== candidate.level) continue

    const recordPn = norm(record.lenovoPn)
    const samePhase = buildPhase === norm(record.buildPhase)
    const sameDescription = Boolean(description) && description === norm(record.description)
    const sameConfiguration = configuration === norm(record.configuration)

    if (pn && recordPn && pn === recordPn) {
      let score = 3
      if (samePhase) score += 2
      if (sameDescription) score += 1
      if (sameConfiguration) score += 1
      if (score >= 5 && score > bestScore) {
        best = record
        bestScore = score
      }
      continue
    }

    if (!pn && !recordPn && sameDescription && sameConfiguration && samePhase) {
      const score = 4
      if (score > bestScore) {
        best = record
        bestScore = score
      }
    }
  }

  return best
}
