import { expect, it } from 'vitest'
import { evaluate } from '../src/budget.js'

const sizes = [
  { file: 'assets/index-abc.js', none: 120_000, gzip: 40_000, brotli: 35_000 },
  { file: 'assets/vendor-def.js', none: 300_000, gzip: 90_000, brotli: 80_000 },
  { file: 'assets/index-abc.css', none: 20_000, gzip: 5_000, brotli: 4_000 },
]

it('sums matched files per budget with its compression', () => {
  const [js, css, all] = evaluate(
    sizes,
    [
      { path: 'assets/*.js', max: '120 kB' },
      { path: '**/*.css', max: '10 kB', compression: 'none' },
      { path: '**', max: '200 kB', compression: 'brotli' },
    ],
    'gzip',
  )
  expect(js).toMatchObject({ total: 130_000, limit: 120_000, ok: false, compression: 'gzip' })
  expect(css).toMatchObject({ total: 20_000, ok: false, files: ['assets/index-abc.css'] })
  expect(all).toMatchObject({ total: 119_000, ok: true })
})

it('treats a budget with no matches as passing', () => {
  expect(evaluate(sizes, [{ path: '*.wasm', max: 1 }], 'gzip')[0]).toMatchObject({ total: 0, ok: true, files: [] })
})

it('flags single files over maxFile even when the total fits', () => {
  const [result] = evaluate(sizes, [{ path: 'assets/*.js', max: '1 MB', maxFile: '50 kB' }], 'gzip')
  expect(result).toMatchObject({ ok: false, oversized: [{ file: 'assets/vendor-def.js', size: 90_000 }] })
})

it('targets named groups like @initial', () => {
  const [initial] = evaluate(sizes, [{ path: '@initial', max: '50 kB' }], 'gzip', {
    initial: ['assets/index-abc.js', 'assets/index-abc.css'],
  })
  expect(initial).toMatchObject({ total: 45_000, ok: true, files: ['assets/index-abc.js', 'assets/index-abc.css'] })
  expect(() => evaluate(sizes, [{ path: '@nope', max: 1 }], 'gzip', { initial: [] })).toThrow('Unknown budget group "@nope". Available: @initial')
})

it('warns when a budget is nearly used up', () => {
  const [near, far] = evaluate(
    sizes,
    [
      { path: 'assets/*.css', max: '5.2 kB' },
      { path: 'assets/*.css', max: '50 kB' },
    ],
    'gzip',
  )
  expect([near?.ok, near?.warning, far?.warning]).toEqual([true, true, false])
})

it('fails budgets that grew more than maxIncrease against the baseline', () => {
  const baseline = [{ path: 'assets/*.js', total: 120_000 }]
  const [pct] = evaluate(sizes, [{ path: 'assets/*.js', max: '1 MB', maxIncrease: '5%' }], 'gzip', {}, 0.9, baseline)
  expect(pct).toMatchObject({ ok: false, increase: { bytes: 10_000, limit: 6_000 } })
  const [abs] = evaluate(sizes, [{ path: 'assets/*.js', max: '1 MB', maxIncrease: '20 kB' }], 'gzip', {}, 0.9, baseline)
  expect(abs?.ok).toBe(true)
  const [none] = evaluate(sizes, [{ path: 'assets/*.js', max: '1 MB', maxIncrease: '1%' }], 'gzip')
  expect(none?.ok).toBe(true)
})
