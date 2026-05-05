import type { BudgetResult } from './budget.js'
import { sizeOf, type Compression, type FileSize } from './measure.js'
import type { Contributor } from './modules.js'
import { formatBytes } from './size.js'

export interface Report {
  version: 1
  compression: Compression
  files: FileSize[]
  budgets: BudgetResult[]
  /** Largest packages and source files by minified size. */
  contributors?: Contributor[]
  /** When and from which commit the report was produced, if known. */
  meta?: { createdAt: string; commit?: string; name?: string }
  /** Packages bundled from several install paths. */
  duplicates?: { name: string; paths: string[] }[]
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

export function toMarkdown(report: Report, baseline?: Report, name?: string, minChange = 0): string {
  const previousBudget = new Map(baseline?.budgets.map((b) => [b.path, b.total]))
  const lines = [
    name ? `### Bundle size budgets — ${name}` : '### Bundle size budgets',
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

  const totalNow = report.files.reduce((sum, f) => sum + sizeOf(f, report.compression), 0)
  const totalBefore = baseline?.files.reduce((sum, f) => sum + sizeOf(f, report.compression), 0)
  lines.push('', `**Total (${report.compression}):** ${formatBytes(totalNow)}${totalBefore === undefined ? '' : `, ${delta(totalNow, totalBefore)}`}`)

  const grew = report.budgets
    .filter((b) => b.increase)
    .map((b) => `- \`${b.path}\` grew by ${formatBytes(b.increase!.bytes)}, more than the allowed ${formatBytes(b.increase!.limit)}`)
  if (grew.length > 0) lines.push('', ...grew)

  const oversized = report.budgets.flatMap((b) =>
    b.oversized.map((f) => `- \`${stableName(f.file)}\` is ${formatBytes(f.size)}, above the per-file limit of \`${b.path}\``),
  )
  if (oversized.length > 0) lines.push('', ...oversized)

  if (baseline) {
    const key = report.compression
    const before = new Map(baseline.files.map((f) => [stableName(f.file), sizeOf(f, key)]))
    const changed = report.files
      .map((f) => ({ name: stableName(f.file), size: sizeOf(f, key), prev: before.get(stableName(f.file)) }))
      // Hide noise: files whose size moved by less than minChange bytes.
      .filter((f) => f.prev === undefined || Math.abs(f.size - f.prev) > minChange)
      .sort((a, b) => Math.abs(b.size - (b.prev ?? 0)) - Math.abs(a.size - (a.prev ?? 0)))
      .slice(0, 10)
    if (changed.length > 0) {
      lines.push('', `<details><summary>Changed files (${key})</summary>`, '', '| File | Size | Change |', '|---|---:|---:|')
      lines.push(...changed.map((f) => `| \`${f.name}\` | ${formatBytes(f.size)} | ${delta(f.size, f.prev)} |`))
      lines.push('', '</details>')
    }
  }

  if (report.contributors?.length) {
    lines.push('', '<details><summary>Largest contributors (minified)</summary>', '', '| Module | Size |', '|---|---:|')
    lines.push(...report.contributors.map((c) => `| \`${c.name}\` | ${formatBytes(c.bytes)} |`))
    lines.push('', '</details>')
  }

  if (report.duplicates?.length) {
    lines.push('', '**Duplicate packages:** ' + report.duplicates.map((d) => `\`${d.name}\` ×${d.paths.length}`).join(', '))
  }

  return lines.join('\n') + '\n'
}
