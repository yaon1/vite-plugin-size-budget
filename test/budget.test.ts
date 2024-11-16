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
