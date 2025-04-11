import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import picomatch from 'picomatch'
import type { Plugin, ResolvedConfig } from 'vite'
import { evaluate, type Budget } from './budget.js'
import { duplicatePackages, topContributors, type ModuleLike } from './modules.js'
import { initialFiles, type OutputAssetLike, type OutputChunkLike } from './graph.js'
import { measure, type Compression, type FileSize } from './measure.js'
import { toMarkdown, type Report } from './report.js'
import { formatBytes, parseSize } from './size.js'

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
  /** Globs of output files to leave out entirely, e.g. "*.wasm" or "stats.html". */
  exclude?: string[]
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

function validate(options: SizeBudgetOptions): void {
  if (!Array.isArray(options.budgets) || options.budgets.length === 0) {
    throw new Error('vite-plugin-size-budget: pass at least one budget, e.g. { path: "assets/*.js", max: "150 kB" }')
  }
  if (options.warnAt !== undefined && !(options.warnAt > 0 && options.warnAt <= 1)) {
    throw new Error('vite-plugin-size-budget: warnAt must be between 0 and 1')
  }
  for (const b of options.budgets) parseSize(b.max)
}

export default function sizeBudget(options: SizeBudgetOptions): Plugin {
  validate(options)
  const compression = options.compression ?? 'gzip'
  const failOnExceed = options.failOnExceed ?? Boolean(process.env.CI)
  let config: ResolvedConfig
  // A build can emit several outputs (e.g. library formats es + cjs); collect them all
  // and judge once in closeBundle, otherwise the last output would overwrite the report.
  let sizes: FileSize[] = []
  let initial: string[] = []
  let chunks: { modules: Record<string, ModuleLike> }[] = []
  const isExcluded = options.exclude?.length ? picomatch(options.exclude, { dot: true }) : () => false

  return {
    name: 'vite-plugin-size-budget',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      config = resolved
    },

    buildStart() {
      sizes = []
      initial = []
      chunks = []
    },

    generateBundle(_, bundle) {
      // SSR builds produce server code that isn't shipped to browsers.
      if (config.build.ssr) return

      sizes.push(
        ...Object.values(bundle)
          .filter((o) => !o.fileName.endsWith('.map') && !isExcluded(o.fileName))
          .map((o) => measure(o.fileName, o.type === 'chunk' ? o.code : o.source)),
      )
      initial.push(...initialFiles(bundle as unknown as Record<string, OutputChunkLike | OutputAssetLike>))
      chunks.push(...Object.values(bundle).filter((o) => o.type === 'chunk'))
    },

    async closeBundle() {
      if (config.build.ssr || sizes.length === 0) return
      // Escape hatch for emergency deploys: SIZE_BUDGET_SKIP=1 vite build
      if (process.env.SIZE_BUDGET_SKIP === '1') {
        config.logger.warn('  size budgets skipped (SIZE_BUDGET_SKIP=1)')
        return
      }

      const report: Report = {
        version: 1,
        compression,
        files: sizes,
        budgets: evaluate(sizes, options.budgets, compression, { initial }, options.warnAt ?? 0.9),
        contributors: topContributors(chunks, config.root),
        duplicates: duplicatePackages(chunks),
      }
      for (const d of report.duplicates ?? []) config.logger.warn(`  ⚠ ${d.name} is bundled ${d.paths.length} times: ${d.paths.join(', ')}`)
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
