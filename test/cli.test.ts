import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { run } from '../src/cli.js'
import type { Report } from '../src/report.js'

const budget = (total: number) => ({ path: '@initial', compression: 'gzip' as const, limit: 100_000, total, files: [], ok: total <= 100_000, warning: false, oversized: [] })

async function write(report: Report): Promise<string> {
  const file = join(await mkdtemp(join(tmpdir(), 'cli-')), 'r.json')
  await writeFile(file, JSON.stringify(report))
  return file
}

it('compares two reports', async () => {
  const base = await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(80_000)] })
  const head = await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(90_000)] })
  const [code, out] = await run(['compare', base, head])
  expect(code).toBe(0)
  expect(out).toContain('+10.00 kB (+12.5%)')
})

it('checks a report and fails on exceeded budgets', async () => {
  expect((await run(['check', await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(50_000)] })]))[0]).toBe(0)
  expect(await run(['check', await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(150_000)] })])).toEqual([1, 'Over budget: @initial\n'])
})

it('prints usage for unknown commands', async () => {
  expect((await run(['nope']))[0]).toBe(2)
})
