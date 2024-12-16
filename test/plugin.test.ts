import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { beforeEach, expect, it } from 'vitest'
import sizeBudget from '../src/index.js'
import type { Report } from '../src/report.js'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(await realpath(tmpdir()), 'size-budget-'))
  await writeFile(join(root, 'index.html'), '<script type="module" src="./main.js"></script>')
  await writeFile(join(root, 'main.js'), `console.log(${JSON.stringify('lorem ipsum '.repeat(2000))})`)
})

const run = (max: string, failOnExceed: boolean) =>
  build({
    root,
    logLevel: 'silent',
    build: { outDir: 'dist' },
    plugins: [sizeBudget({ budgets: [{ path: 'assets/*.js', max }], failOnExceed, reportFile: 'dist/size.json' })],
  })

it('writes a report for passing builds', async () => {
  await run('50 kB', true)
  const report = JSON.parse(await readFile(join(root, 'dist/size.json'), 'utf8')) as Report
  expect(report.budgets[0]).toMatchObject({ ok: true, path: 'assets/*.js' })
  expect(report.files.some((f) => f.file.endsWith('.js'))).toBe(true)
})

it('fails the build when over budget', async () => {
  await expect(run('100 B', true)).rejects.toThrow(/Size budget exceeded: assets\/\*\.js/)
})

it('only warns when failOnExceed is false', async () => {
  await expect(run('100 B', false)).resolves.toBeDefined()
})
