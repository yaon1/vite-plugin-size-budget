import { readFileSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import picomatch from 'picomatch'
import type { Plugin, ResolvedConfig } from 'vite'
import { evaluate, type Budget } from './budget.js'
import { duplicatePackages, topContributors, type ModuleLike } from './modules.js'
import { toHtml } from './html.js'
import { entryGroups, initialFiles, lazyFiles, typeGroups, type OutputAssetLike, type OutputChunkLike } from './graph.js'
import { createMeasureCache, type Compression, type FileSize } from './measure.js'
import { toMarkdown, type Report } from './report.js'
import { formatBytes, parseSize } from './size.js'

export interface SizeBudgetOptions {
  /** Budgets to check. When omitted, `sizeBudgets` from the project's package.json is used. */
  budgets?: Budget[]
  /** Default compression for budgets that don't set one. */
  compression?: Compression
  /** Fail the build when a budget is exceeded. Default: true in CI, false locally. */
  failOnExceed?: boolean
  /** Where to write the JSON report, relative to the project root. `false` disables it. */
  reportFile?: string | false
  /** A previous JSON report to diff against: a path or an http(s) URL. */
  baseline?: string
  /** Globs of output files to leave out entirely, e.g. "*.wasm" or "stats.html". */
  exclude?: string[]
  /** Fraction of a limit above which a passing budget is reported as a warning. Default: 0.9. */
  warnAt?: number
  /**
   * Remember the last local build in node_modules/.cache and print how each budget
   * changed since then. Default: true outside CI.
   */
  compareWithLast?: boolean
  /** Write a standalone HTML report, e.g. "dist/size-report.html". */
  htmlFile?: string
  /** Also write the markdown report to this file, e.g. for a sticky PR comment action. */
  markdownFile?: string
  /** Hide per-file changes smaller than this from the diff table. Default: 50 B. */
  minChange?: string | number
  /** Label for this build in the summary when several builds report into one job. */
  name?: string
  /** Append a markdown table to $GITHUB_STEP_SUMMARY when present. Default: true. */
  githubSummary?: boolean
}

export type { Budget, BudgetResult } from './budget.js'
export { fromLighthouse } from './lighthouse.js'
// Building blocks for custom tooling (e.g. checking a non-Vite build).
export { evaluate } from './budget.js'
export { initialFiles, lazyFiles, entryGroups, typeGroups } from './graph.js'
export { toHtml } from './html.js'
export { measure } from './measure.js'
export { toMarkdown, stableName } from './report.js'
export { parseSize, formatBytes } from './size.js'
export type { Compression, FileSize } from './measure.js'
export type { Report } from './report.js'

async function readBaseline(path: string): Promise<Report | undefined> {
  try {
    // A URL lets CI fetch main's report from object storage or a CDN instead of an artifact.
    if (/^https?:\/\//.test(path)) {
      const res = await fetch(path, { signal: AbortSignal.timeout(10_000) })
      return res.ok ? ((await res.json()) as Report) : undefined
    }
    return JSON.parse(await readFile(path, 'utf8')) as Report
  } catch {
    return undefined
  }
}

function readPackageBudgets(root: string): Budget[] {
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { sizeBudgets?: Budget[] }
    return pkg.sizeBudgets ?? []
  } catch {
    return []
  }
}

function validate(options: SizeBudgetOptions & { budgets: Budget[] }): void {
  if (!Array.isArray(options.budgets) || options.budgets.length === 0) {
    throw new Error('vite-plugin-size-budget: pass at least one budget, e.g. { path: "assets/*.js", max: "150 kB" }')
  }
  if (options.warnAt !== undefined && !(options.warnAt > 0 && options.warnAt <= 1)) {
    throw new Error('vite-plugin-size-budget: warnAt must be between 0 and 1')
  }
  for (const b of options.budgets) parseSize(b.max)
}

export default function sizeBudget(userOptions: SizeBudgetOptions = {}): Plugin {
  // Budgets may come from package.json, which is only known once the root is resolved.
  let options = userOptions as SizeBudgetOptions & { budgets: Budget[] }
  if (userOptions.budgets) validate(options)
  const compression = options.compression ?? 'gzip'
  const failOnExceed = options.failOnExceed ?? Boolean(process.env.CI)
  let config: ResolvedConfig
  // A build can emit several outputs (e.g. library formats es + cjs); collect them all
  // and judge once in closeBundle, otherwise the last output would overwrite the report.
  let sizes: FileSize[] = []
  let initial: string[] = []
  let lazy: string[] = []
  let entries: Record<string, string[]> = {}
  let chunks: { modules: Record<string, ModuleLike> }[] = []
  let used: Compression[] = []
  const measure = createMeasureCache()
  const isExcluded = options.exclude?.length ? picomatch(options.exclude, { dot: true }) : () => false

  return {
    name: 'vite-plugin-size-budget',
    apply: 'build',
    enforce: 'post',

    configResolved(resolved) {
      config = resolved
      if (!userOptions.budgets) {
        options = { ...userOptions, budgets: readPackageBudgets(resolved.root) }
        validate(options)
      }
      used = [...new Set([compression, ...options.budgets.map((b) => b.compression ?? compression)])]
    },

    buildStart() {
      sizes = []
      initial = []
      lazy = []
      entries = {}
      chunks = []
    },

    generateBundle(_, bundle) {
      // SSR builds (and, with Vite 6+ environments, any non-client environment)
      // produce server code that isn't shipped to browsers.
      const environment = (this as { environment?: { name: string } }).environment
      if (config.build.ssr || (environment && environment.name !== 'client')) return

      sizes.push(
        ...Object.values(bundle)
          .filter((o) => !o.fileName.endsWith('.map') && !isExcluded(o.fileName))
          .map((o) => measure(o.fileName, o.type === 'chunk' ? o.code : o.source, used)),
      )
      const graph = bundle as unknown as Record<string, OutputChunkLike | OutputAssetLike>
      initial.push(...initialFiles(graph))
      lazy.push(...lazyFiles(graph))
      for (const [name, files] of Object.entries(entryGroups(graph))) entries[name] = [...(entries[name] ?? []), ...files]
      chunks.push(...Object.values(bundle).filter((o) => o.type === 'chunk'))
    },

    async closeBundle() {
      if (config.build.ssr || sizes.length === 0) return
      // Escape hatch for emergency deploys: SIZE_BUDGET_SKIP=1 vite build
      if (process.env.SIZE_BUDGET_SKIP === '1') {
        config.logger.warn('  size budgets skipped (SIZE_BUDGET_SKIP=1)')
        return
      }

      const baseline = options.baseline
        ? await readBaseline(/^https?:\/\//.test(options.baseline) ? options.baseline : resolve(config.root, options.baseline))
        : undefined
      const report: Report = {
        version: 1,
        compression,
        files: sizes,
        budgets: evaluate(
          sizes,
          options.budgets,
          compression,
          { initial, lazy, ...entries, ...typeGroups(sizes.map((f) => f.file)) },
          options.warnAt ?? 0.9,
          baseline?.budgets,
        ),
        meta: { createdAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? process.env.CI_COMMIT_SHA, name: options.name },
        contributors: topContributors(chunks, config.root),
        duplicates: duplicatePackages(chunks),
      }
      for (const d of report.duplicates ?? []) config.logger.warn(`  ⚠ ${d.name} is bundled ${d.paths.length} times: ${d.paths.join(', ')}`)
      const lastFile = resolve(config.root, 'node_modules/.cache/vite-plugin-size-budget/last.json')
      const compareLocal = options.compareWithLast ?? !process.env.CI
      const last = compareLocal ? await readBaseline(lastFile) : undefined

      if (options.reportFile !== false) {
        const file = resolve(config.root, options.reportFile ?? 'size-report.json')
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, JSON.stringify(report, null, 2))
      }

      const markdown = toMarkdown(report, baseline, options.name, parseSize(options.minChange ?? 50))
      if (options.markdownFile) {
        const file = resolve(config.root, options.markdownFile)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, markdown)
      }
      if (options.htmlFile) {
        const file = resolve(config.root, options.htmlFile)
        await mkdir(dirname(file), { recursive: true })
        await writeFile(file, toHtml(report, options.name ? `Bundle size — ${options.name}` : undefined))
      }
      const summary = process.env.GITHUB_STEP_SUMMARY
      if (summary && options.githubSummary !== false) await appendFile(summary, markdown)

      for (const b of report.budgets) {
        if (b.files.length === 0 && !b.path.startsWith('@')) config.logger.warn(`  ? ${b.path} matched no files — check the glob`)
      }
      const width = Math.max(...report.budgets.map((b) => b.path.length))
      for (const b of report.budgets) {
        const previous = last?.budgets.find((p) => p.path === b.path)?.total
        const change =
          previous === undefined || previous === b.total
            ? ''
            : ` (${b.total > previous ? '+' : ''}${formatBytes(b.total - previous)} since last build)`
        const line = `${b.path.padEnd(width)}  ${formatBytes(b.total).padStart(10)} / ${formatBytes(b.limit).padEnd(10)} ${b.compression}${change}`
        if (b.ok && b.warning) config.logger.warn(`  ! ${line} — ${Math.round((b.total / b.limit) * 100)}% of the budget`)
        else if (b.ok) config.logger.info(`  ✓ ${line}`)
        else if (b.total > b.limit) config.logger.warn(`  ✗ ${line} — over by ${formatBytes(b.total - b.limit)}`)
        else config.logger.warn(`  ✗ ${line}`)
        if (b.increase)
          config.logger.warn(`      grew by ${formatBytes(b.increase.bytes)} since the baseline, allowed ${formatBytes(b.increase.limit)}`)
        for (const f of b.oversized) config.logger.warn(`      ${f.file} is ${formatBytes(f.size)}, above the per-file limit`)
      }

      // Inline annotations on the workflow run page.
      if (process.env.GITHUB_ACTIONS === 'true') {
        for (const b of report.budgets) {
          if (!b.ok) console.log(`::error title=Size budget exceeded::${b.path} is ${formatBytes(b.total)} (limit ${formatBytes(b.limit)})`)
          else if (b.warning)
            console.log(`::warning title=Size budget nearly used::${b.path} is at ${Math.round((b.total / b.limit) * 100)}%`)
        }
      }

      if (compareLocal) {
        await mkdir(dirname(lastFile), { recursive: true })
        await writeFile(lastFile, JSON.stringify(report))
      }

      const failed = report.budgets.filter((b) => !b.ok)
      if (failed.length > 0 && failOnExceed) {
        this.error(`Size budget exceeded: ${failed.map((b) => b.path).join(', ')}`)
      }
    },
  }
}
