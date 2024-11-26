import { expect, it } from 'vitest'
import { stableName, toMarkdown, type Report } from '../src/report.js'

it('strips Vite content hashes', () => {
  expect(stableName('assets/index-B3NpPW9K.js')).toBe('assets/index.js')
  expect(stableName('assets/my-lib-a_b-cD3f.css')).toBe('assets/my-lib.css')
  expect(stableName('favicon.ico')).toBe('favicon.ico')
})

const file = (file: string, gzip: number) => ({ file, none: gzip * 3, gzip, brotli: gzip - 1 })
const budget = (total: number) => ({ path: 'assets/*.js', compression: 'gzip' as const, limit: 50_000, total, files: [], ok: total <= 50_000 })

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

    <details><summary>Changed files (gzip)</summary>

    | File | Size | Change |
    |---|---:|---:|
    | \`assets/index.js\` | 52.00 kB | +12.00 kB (+30.0%) |
    | \`assets/chart.js\` | 3.00 kB | new |

    </details>
    "
  `)
})
