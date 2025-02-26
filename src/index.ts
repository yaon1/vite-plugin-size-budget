import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { evaluate, type Budget } from './budget.js'
import { initialFiles, type OutputAssetLike, type OutputChunkLike } from './graph.js'
import { measure, type Compression } from './measure.js'
import { toMarkdown, type Report } from './report.js'
import { formatBytes } from './size.js'

export interface SizeBudgetOptions {
  budgets: Budget[]
  /** Default compression for budgets that don't set one. */
  compression?: Compression
  /** Fail the build when a budget is exceeded. Default: true in CI, false locally. */
  failOnExceed?: boolean
  /** Where to write the JSON report, relative to the project root. `false` disables it. */
  reportFile?: string | false
  /** A previous JSON report to diff against (e.g. downloaded from the main branch). */
  baseline?: string
  /** Fraction of a limit above which a passing budget is reported as a warning. Default: 0.9. */
  warnAt?: number
  /** Append a markdown table to $GITHUB_STEP_SUMMARY when present. Default: true. */
  githubSummary?: boolean
}

export type { Budget, BudgetResult } from './budget.js'
export type { Compression, FileSize } from './measure.js'
export type { Report } from './report.js'

async function readBaseline(path: string): Promise<Report | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Report
  } catch {
    return undefined
  }
}

export default function sizeBudget(options: SizeBudgetOptions): Plugin {
  const compression = options.compression ?? 'gzip'
  const failOnExceed = options.failOnExceed ?? Boolean(process.env.CI)
  let config: ResolvedConfig

  return {
    name: 'vite-plugin-size-budget',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      config = resolved
    },

    async generateBundle(_, bundle) {
      // SSR builds produce server code that isn't shipped to browsers.
      if (config.build.ssr) return

      const sizes = Object.values(bundle)
        .filter((o) => !o.fileName.endsWith('.map'))
        .map((o) => measure(o.fileName, o.type === 'chunk' ? o.code : o.source))
      const report: Report = { version: 1, compression, files: sizes, budgets: evaluate(sizes, options.budgets, compression, {
        initial: initialFiles(bundle as unknown as Record<string, OutputChunkLike | OutputAssetLike>),
      }, options.warnAt ?? 0.9) }
      const baseline = options.baseline ? await readBaseline(resolve(config.root, options.baseline)) : undefined

      if (options.reportFile !== false) {
        const file = resolve(config.root, options.reportFile ?? 'size-report.json')
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, JSON.stringify(report, null, 2))
      }

      const summary = process.env.GITHUB_STEP_SUMMARY
      if (summary && options.githubSummary !== false) await appendFile(summary, toMarkdown(report, baseline))

      for (const b of report.budgets) {
        const line = `${b.path} (${b.compression}): ${formatBytes(b.total)} / ${formatBytes(b.limit)}`
        if (b.ok && b.warning) config.logger.warn(`  ! ${line} — ${Math.round((b.total / b.limit) * 100)}% of the budget`)
        else if (b.ok) config.logger.info(`  ✓ ${line}`)
        else if (b.total > b.limit) config.logger.warn(`  ✗ ${line} — over by ${formatBytes(b.total - b.limit)}`)
        else config.logger.warn(`  ✗ ${line}`)
        for (const f of b.oversized) config.logger.warn(`      ${f.file} is ${formatBytes(f.size)}, above the per-file limit`)
      }

      const failed = report.budgets.filter((b) => !b.ok)
      if (failed.length > 0 && failOnExceed) {
        this.error(`Size budget exceeded: ${failed.map((b) => b.path).join(', ')}`)
      }
    },
  }
}
