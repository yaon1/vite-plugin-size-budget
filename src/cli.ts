import { readFile } from 'node:fs/promises'
import { toMarkdown, type Report } from './report.js'

const USAGE = `Usage:
  size-budget compare <base.json> <head.json>   Markdown diff, e.g. for a PR comment
  size-budget check <report.json>               Exit 1 if any budget failed`

async function load(path: string): Promise<Report> {
  const report = JSON.parse(await readFile(path, 'utf8')) as Report
  if (report.version !== 1) throw new Error(`${path}: unsupported report version ${String(report.version)}`)
  return report
}

/** Returns [exit code, output]; kept pure so it can be tested without spawning a process. */
export async function run(argv: string[]): Promise<[number, string]> {
  const [command, ...files] = argv
  if (command === 'compare' && files.length === 2) {
    const [base, head] = await Promise.all(files.map(load))
    return [0, toMarkdown(head!, base)]
  }
  if (command === 'check' && files.length === 1) {
    const report = await load(files[0]!)
    const failed = report.budgets.filter((b) => !b.ok)
    return failed.length === 0 ? [0, 'All budgets pass\n'] : [1, `Over budget: ${failed.map((b) => b.path).join(', ')}\n`]
  }
  return [2, USAGE + '\n']
}
