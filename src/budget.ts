import picomatch from 'picomatch'
import type { Compression, FileSize } from './measure.js'
import { parseSize } from './size.js'

export interface Budget {
  /**
   * Glob matched against output file names, e.g. "assets/*.js", or a group:
   * "@initial" (entries + static imports + their CSS), "@lazy" (dynamic-only chunks),
   * "@js", "@css", "@images", "@fonts", or "@entry:<name>" for one entry of a multi-page app.
   */
  path: string
  /** Limit for the sum of all matched files. */
  max: string | number
  compression?: Compression
  /** Also fail when any single matched file is larger than this. */
  maxFile?: string | number
}

export interface BudgetResult {
  path: string
  compression: Compression
  limit: number
  total: number
  files: string[]
  ok: boolean
  /** Within the limit but above `warnAt` of it — worth a look before it breaks. */
  warning: boolean
  /** Files that break `maxFile`, with their size. */
  oversized: { file: string; size: number }[]
}

/** Named file groups that budgets can target with "@name". */
export type Groups = Record<string, readonly string[]>

export function evaluate(
  sizes: readonly FileSize[],
  budgets: readonly Budget[],
  defaultCompression: Compression,
  groups: Groups = {},
  warnAt = 0.9,
): BudgetResult[] {
  return budgets.map((budget) => {
    const compression = budget.compression ?? defaultCompression
    const group = budget.path.startsWith('@') ? groups[budget.path.slice(1)] : undefined
    if (budget.path.startsWith('@') && !group) throw new Error(`Unknown budget group "${budget.path}"`)
    const isMatch = group ? (file: string) => group.includes(file) : picomatch(budget.path, { dot: true })
    const matched = sizes.filter((s) => isMatch(s.file))
    const total = matched.reduce((sum, s) => sum + s[compression], 0)
    const limit = parseSize(budget.max)
    const fileLimit = budget.maxFile === undefined ? Infinity : parseSize(budget.maxFile)
    const oversized = matched.filter((s) => s[compression] > fileLimit).map((s) => ({ file: s.file, size: s[compression] }))
    return { path: budget.path, compression, limit, total, files: matched.map((s) => s.file), ok: total <= limit && oversized.length === 0, warning: total <= limit && total > limit * warnAt, oversized }
  })
}
