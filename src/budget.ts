import picomatch from 'picomatch'
import type { Compression, FileSize } from './measure.js'
import { parseSize } from './size.js'

export interface Budget {
  /** Glob matched against output file names, e.g. "assets/*.js". */
  path: string
  /** Limit for the sum of all matched files. */
  max: string | number
  compression?: Compression
}

export interface BudgetResult {
  path: string
  compression: Compression
  limit: number
  total: number
  files: string[]
  ok: boolean
}

export function evaluate(sizes: readonly FileSize[], budgets: readonly Budget[], defaultCompression: Compression): BudgetResult[] {
  return budgets.map((budget) => {
    const compression = budget.compression ?? defaultCompression
    const isMatch = picomatch(budget.path, { dot: true })
    const matched = sizes.filter((s) => isMatch(s.file))
    const total = matched.reduce((sum, s) => sum + s[compression], 0)
    const limit = parseSize(budget.max)
    return { path: budget.path, compression, limit, total, files: matched.map((s) => s.file), ok: total <= limit }
  })
}
