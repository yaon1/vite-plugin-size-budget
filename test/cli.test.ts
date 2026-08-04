import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { run } from '../src/cli.js'
import type { Report } from '../src/report.js'

const budget = (total: number) => ({
  path: '@initial',
  compression: 'gzip' as const,
  limit: 100_000,
  total,
  files: [],
  ok: total <= 100_000,
  warning: false,
  oversized: [],
})

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
  expect(await run(['check', await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(150_000)] })])).toEqual([
    1,
    'Over budget: @initial\n',
  ])
})

it('prints usage for unknown commands', async () => {
  expect((await run(['nope']))[0]).toBe(2)
})

it('renders HTML from a report', async () => {
  const [code, html] = await run(['html', await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(1)] })])
  expect(code).toBe(0)
  expect(html).toContain('<h1>Bundle size report</h1>')
})

it('treats warnings as failures with --strict', async () => {
  const report = await write({ version: 1, compression: 'gzip', files: [], budgets: [{ ...budget(95_000), warning: true }] })
  expect((await run(['check', report]))[0]).toBe(0)
  expect((await run(['check', '--strict', report]))[0]).toBe(1)
})

it('converts a Lighthouse budget file', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'lh-')), 'budget.json')
  await writeFile(file, JSON.stringify([{ resourceSizes: [{ resourceType: 'script', budget: 100 }] }]))
  const [code, out] = await run(['lighthouse', file])
  expect([code, JSON.parse(out)]).toEqual([0, [{ path: '@js', max: 102_400, compression: 'gzip' }]])
})

it('rejects reports from an unknown version', async () => {
  const file = await write({ version: 2 } as unknown as Report)
  await expect(run(['check', file])).rejects.toThrow(/unsupported report version 2/)
})

it('labels compare output with --name', async () => {
  const base = await write({ version: 1, compression: 'gzip', files: [], budgets: [budget(1)] })
  expect((await run(['compare', '--name=web', base, base]))[1]).toMatch(/^### Bundle size budgets — web/)
})
