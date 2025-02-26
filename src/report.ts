import type { BudgetResult } from './budget.js'
import type { Compression, FileSize } from './measure.js'
import { formatBytes } from './size.js'

export interface Report {
  version: 1
  compression: Compression
  files: FileSize[]
  budgets: BudgetResult[]
}

/** Strips Vite's content hash so files can be matched across builds: "index-B3NpPW9K.js" → "index.js". */
export function stableName(file: string): string {
  return file.replace(/-[\w-]{8}(?=\.[a-z0-9]+$)/i, '')
}

function delta(current: number, previous: number | undefined): string {
  if (previous === undefined) return 'new'
  const diff = current - previous
  if (diff === 0) return '±0'
  const pct = previous === 0 ? '' : ` (${diff > 0 ? '+' : ''}${((diff / previous) * 100).toFixed(1)}%)`
  return `${diff > 0 ? '+' : ''}${formatBytes(diff)}${pct}`
}

export function toMarkdown(report: Report, baseline?: Report): string {
  const previousBudget = new Map(baseline?.budgets.map((b) => [b.path, b.total]))
  const lines = [
    '### Bundle size budgets',
    '',
    '| Budget | Size | Limit | Change | |',
    '|---|---:|---:|---:|:-:|',
    ...report.budgets.map(
      (b) =>
        `| \`${b.path}\` (${b.compression}) | ${formatBytes(b.total)} | ${formatBytes(b.limit)} | ${
          baseline ? delta(b.total, previousBudget.get(b.path)) : '—'
        } | ${!b.ok ? '❌' : b.warning ? '⚠️' : '✅'} |`,
    ),
  ]

  const oversized = report.budgets.flatMap((b) => b.oversized.map((f) => `- \`${stableName(f.file)}\` is ${formatBytes(f.size)}, above the per-file limit of \`${b.path}\``))
  if (oversized.length > 0) lines.push('', ...oversized)

  if (baseline) {
    const key = report.compression
    const before = new Map(baseline.files.map((f) => [stableName(f.file), f[key]]))
    const changed = report.files
      .map((f) => ({ name: stableName(f.file), size: f[key], prev: before.get(stableName(f.file)) }))
      .filter((f) => f.prev !== f.size)
      .sort((a, b) => Math.abs(b.size - (b.prev ?? 0)) - Math.abs(a.size - (a.prev ?? 0)))
      .slice(0, 10)
    if (changed.length > 0) {
      lines.push('', `<details><summary>Changed files (${key})</summary>`, '', '| File | Size | Change |', '|---|---:|---:|')
      lines.push(...changed.map((f) => `| \`${f.name}\` | ${formatBytes(f.size)} | ${delta(f.size, f.prev)} |`))
      lines.push('', '</details>')
    }
  }

  return lines.join('\n') + '\n'
}
