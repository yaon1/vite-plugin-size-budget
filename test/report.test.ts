import { expect, it } from 'vitest'
import { stableName, toMarkdown, type Report } from '../src/report.js'

it('strips Vite content hashes', () => {
  expect(stableName('assets/index-B3NpPW9K.js')).toBe('assets/index.js')
  expect(stableName('assets/my-lib-a_b-cD3f.css')).toBe('assets/my-lib.css')
  expect(stableName('favicon.ico')).toBe('favicon.ico')
})

const file = (file: string, gzip: number) => ({ file, none: gzip * 3, gzip, brotli: gzip - 1 })
const budget = (total: number) => ({
  path: 'assets/*.js',
  compression: 'gzip' as const,
  limit: 50_000,
  total,
  files: [],
  ok: total <= 50_000,
  warning: false,
  oversized: [],
})

it('renders budgets with deltas and changed files', () => {
  const baseline: Report = { version: 1, compression: 'gzip', files: [file('assets/index-AAAAAAAA.js', 40_000)], budgets: [budget(40_000)] }
  const current: Report = {
    version: 1,
    compression: 'gzip',
    files: [file('assets/index-BBBBBBBB.js', 52_000), file('assets/chart-CCCCCCCC.js', 3_000)],
    budgets: [budget(55_000)],
  }

  expect(toMarkdown(current, baseline)).toMatchInlineSnapshot(`
    "### Bundle size budgets

    | Budget | Size | Limit | Change | |
    |---|---:|---:|---:|:-:|
    | \`assets/*.js\` (gzip) | 55.00 kB | 50.00 kB | +15.00 kB (+37.5%) | ❌ |

    **Total (gzip):** 55.00 kB, +15.00 kB (+37.5%)

    <details><summary>Changed files (gzip)</summary>

    | File | Size | Change |
    |---|---:|---:|
    | \`assets/index.js\` | 52.00 kB | +12.00 kB (+30.0%) |
    | \`assets/chart.js\` | 3.00 kB | new |

    </details>
    "
  `)
})

it('lists files over their per-file limit', () => {
  const report: Report = {
    version: 1,
    compression: 'gzip',
    files: [],
    budgets: [{ ...budget(10), oversized: [{ file: 'assets/big-AAAAAAAA.js', size: 70_000 }] }],
  }
  expect(toMarkdown(report)).toContain('- `assets/big.js` is 70.00 kB, above the per-file limit of `assets/*.js`')
})

it('adds contributors and duplicate packages', () => {
  const report: Report = {
    version: 1,
    compression: 'gzip',
    files: [],
    budgets: [],
    contributors: [{ name: 'date-fns', bytes: 135_000 }],
    duplicates: [{ name: 'date-fns', paths: ['a', 'b'] }],
  }
  const md = toMarkdown(report)
  expect(md).toContain('| `date-fns` | 135.00 kB |')
  expect(md).toContain('**Duplicate packages:** `date-fns` ×2')
})

it('hides file changes below minChange', () => {
  const baseline: Report = { version: 1, compression: 'gzip', files: [file('assets/a-AAAAAAAA.js', 1000), file('assets/b-AAAAAAAA.js', 1000)], budgets: [] }
  const current: Report = { version: 1, compression: 'gzip', files: [file('assets/a-BBBBBBBB.js', 1010), file('assets/b-BBBBBBBB.js', 3000)], budgets: [] }
  const md = toMarkdown(current, baseline, undefined, 100)
  expect(md).toContain('assets/b.js')
  expect(md).not.toContain('assets/a.js')
})
