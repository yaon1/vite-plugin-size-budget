import type { Budget } from './budget.js'

interface LighthouseBudget {
  path?: string
  resourceSizes?: { resourceType: string; budget: number }[]
}

const GROUPS: Record<string, string> = {
  script: '@js',
  stylesheet: '@css',
  image: '@images',
  font: '@fonts',
  total: '**',
}

/**
 * Converts a Lighthouse `budget.json` (resourceSizes in KiB of transfer size) so the
 * same file drives both Lighthouse CI and build-time checks. Unsupported resource
 * types (document, media, third-party, …) are skipped.
 */
export function fromLighthouse(budgets: LighthouseBudget[]): Budget[] {
  const result: Budget[] = []
  for (const entry of budgets) {
    for (const size of entry.resourceSizes ?? []) {
      const path = GROUPS[size.resourceType]
      if (path) result.push({ path, max: size.budget * 1024, compression: 'gzip' })
    }
  }
  return result
}
