import picomatch from 'picomatch'
import { sizeOf, type Compression, type FileSize } from './measure.js'
import { parseSize } from './size.js'

export interface Budget {
  /**
   * Glob matched against output file names, e.g. "assets/*.js", or a group:
   * "@initial" (entries + static imports + their CSS), "@lazy" (dynamic-only chunks),
   * "@js", "@css", "@images", "@fonts", or "@entry:<name>" for one entry of a multi-page app.
   */
  path: string
  /** Human-friendly label for logs and reports, e.g. "First load". Defaults to `path`. */
  label?: string
  /** Limit for the sum of all matched files. */
  max: string | number
  compression?: Compression
  /** Also fail when any single matched file is larger than this. */
  maxFile?: string | number
  /**
   * Fail when the total grew more than this versus the baseline report:
   * a size ("10 kB") or a percentage ("5%"). Ignored without a baseline.
   */
  maxIncrease?: string | number
}

export interface BudgetResult {
  path: string
  label?: string
  compression: Compression
  limit: number
  total: number
  files: string[]
  ok: boolean
  /** Within the limit but above `warnAt` of it — worth a look before it breaks. */
  warning: boolean
  /** Growth versus the baseline when `maxIncrease` was set and exceeded. */
  increase?: { bytes: number; limit: number }
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
  baseline?: readonly { path: string; total: number }[],
): BudgetResult[] {
  return budgets.map((budget) => {
    const compression = budget.compression ?? defaultCompression
    const group = budget.path.startsWith('@') ? groups[budget.path.slice(1)] : undefined
    if (budget.path.startsWith('@') && !group) {
      const known = Object.keys(groups)
        .map((g) => `@${g}`)
        .join(', ')
      throw new Error(`Unknown budget group "${budget.path}". Available: ${known || 'none'}`)
    }
    const isMatch = group ? (file: string) => group.includes(file) : picomatch(budget.path, { dot: true })
    const matched = sizes.filter((s) => isMatch(s.file))
    const total = matched.reduce((sum, s) => sum + sizeOf(s, compression), 0)
    const limit = parseSize(budget.max)
    const fileLimit = budget.maxFile === undefined ? Infinity : parseSize(budget.maxFile)
    const oversized = matched.filter((s) => sizeOf(s, compression) > fileLimit).map((s) => ({ file: s.file, size: sizeOf(s, compression) }))
    const previous = baseline?.find((b) => b.path === budget.path)?.total
    let increase: BudgetResult['increase']
    if (budget.maxIncrease !== undefined && previous !== undefined) {
      const allowed =
        typeof budget.maxIncrease === 'string' && budget.maxIncrease.trim().endsWith('%')
          ? Math.round((previous * parseFloat(budget.maxIncrease)) / 100)
          : parseSize(budget.maxIncrease)
      if (total - previous > allowed) increase = { bytes: total - previous, limit: allowed }
    }
    return {
      path: budget.path,
      ...(budget.label ? { label: budget.label } : {}),
      compression,
      limit,
      total,
      files: matched.map((s) => s.file),
      ok: total <= limit && oversized.length === 0 && increase === undefined,
      warning: total <= limit && total > limit * warnAt,
      oversized,
      ...(increase ? { increase } : {}),
    }
  })
}
