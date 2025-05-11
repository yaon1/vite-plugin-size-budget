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

it('supports the @initial budget on a real build with a lazy chunk', async () => {
  await writeFile(join(root, 'main.js'), "import('./lazy.js').then((m) => m.run()); console.log('main')")
  await writeFile(join(root, 'lazy.js'), `export function run() { console.log(${JSON.stringify('x'.repeat(5000))}) }`)
  await build({ root, logLevel: 'silent', build: { outDir: 'dist' }, plugins: [sizeBudget({ budgets: [{ path: '@initial', max: '5 kB' }], reportFile: 'dist/size.json' })] })
  const report = JSON.parse(await readFile(join(root, 'dist/size.json'), 'utf8')) as Report
  expect(report.budgets[0]?.files.some((f) => f.includes('lazy'))).toBe(false)
  expect(report.budgets[0]?.files.length).toBeGreaterThan(0)
})

it('collects every output of a multi-format library build', async () => {
  await writeFile(join(root, 'lib.js'), 'export const answer = 42')
  await build({
    root,
    logLevel: 'silent',
    build: { outDir: 'dist', lib: { entry: join(root, 'lib.js'), formats: ['es', 'cjs'], fileName: 'lib' } },
    plugins: [sizeBudget({ budgets: [{ path: '*.{js,mjs}', max: '10 kB' }], reportFile: 'dist/size.json' })],
  })
  const report = JSON.parse(await readFile(join(root, 'dist/size.json'), 'utf8')) as Report
  expect(report.files.map((f) => f.file).sort()).toEqual(['lib.js', 'lib.mjs'])
})

it('leaves excluded files out of the report', async () => {
  await build({ root, logLevel: 'silent', build: { outDir: 'dist' }, plugins: [sizeBudget({ budgets: [{ path: '**', max: '1 MB' }], exclude: ['*.html'], reportFile: 'dist/size.json' })] })
  const report = JSON.parse(await readFile(join(root, 'dist/size.json'), 'utf8')) as Report
  expect(report.files.some((f) => f.file.endsWith('.html'))).toBe(false)
})

it('can be skipped with SIZE_BUDGET_SKIP=1', async () => {
  process.env.SIZE_BUDGET_SKIP = '1'
  try {
    await expect(run('1 B', true)).resolves.toBeDefined()
  } finally {
    delete process.env.SIZE_BUDGET_SKIP
  }
})

it('validates options eagerly', () => {
  expect(() => sizeBudget({ budgets: [] })).toThrow(/at least one budget/)
  expect(() => sizeBudget({ budgets: [{ path: '*', max: 'huge' }] })).toThrow(/Invalid size/)
  expect(() => sizeBudget({ budgets: [{ path: '*', max: 1 }], warnAt: 2 })).toThrow(/warnAt/)
})

it('provides @lazy and type groups in builds', async () => {
  await writeFile(join(root, 'main.js'), "import('./lazy.js'); console.log('main')")
  await writeFile(join(root, 'lazy.js'), 'export const x = 1')
  await build({ root, logLevel: 'silent', build: { outDir: 'dist' }, plugins: [sizeBudget({ budgets: [{ path: '@lazy', max: '1 kB' }, { path: '@js', max: '10 kB' }], reportFile: 'dist/size.json' })] })
  const report = JSON.parse(await readFile(join(root, 'dist/size.json'), 'utf8')) as Report
  expect(report.budgets[0]?.files).toHaveLength(1)
  expect(report.budgets[0]?.files[0]).toMatch(/lazy/)
  expect(report.budgets[1]?.files).toHaveLength(2)
})

it('emits GitHub Actions annotations', async () => {
  process.env.GITHUB_ACTIONS = 'true'
  const lines: string[] = []
  const log = console.log
  console.log = (line: string) => void lines.push(line)
  try {
    await run('100 B', false)
  } finally {
    console.log = log
    delete process.env.GITHUB_ACTIONS
  }
  expect(lines.some((l) => l.startsWith('::error title=Size budget exceeded::assets/*.js'))).toBe(true)
})
