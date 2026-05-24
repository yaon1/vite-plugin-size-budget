import { describe, expect, it } from 'vitest'
import { createMeasureCache, measure, zstdAvailable } from '../src/measure.js'
import { formatBytes, parseSize } from '../src/size.js'

describe('parseSize', () => {
  it.each([
    ['150 kB', 150_000],
    ['1.5MiB', 1_572_864],
    ['2048', 2048],
    [512, 512],
  ])('%s → %d', (input, bytes) => expect(parseSize(input)).toBe(bytes))

  it('rejects garbage', () => expect(() => parseSize('big')).toThrow(/Invalid size/))
})

it('formats bytes', () => {
  expect([formatBytes(999), formatBytes(-1500), formatBytes(2_500_000)]).toEqual(['999 B', '-1.50 kB', '2.50 MB'])
})

it('measures compressed sizes', () => {
  const size = measure('a.js', 'x'.repeat(10_000))
  expect(size.none).toBe(10_000)
  expect(size.gzip).toBeLessThan(100)
  expect(size.brotli).toBeLessThan(size.gzip)
})

it.runIf(zstdAvailable())('measures zstd where Node supports it', () => {
  const size = measure('a.js', 'y'.repeat(10_000))
  expect(size.zstd).toBeGreaterThan(0)
  expect(size.zstd).toBeLessThan(200)
})

describe('parseSize edge cases', () => {
  it('accepts decimals and spacing', () => expect(parseSize(' 0.5 MB ')).toBe(500_000))
  it('is case-insensitive', () => expect(parseSize('10KIB')).toBe(10_240))
  it('rejects negative numbers', () => expect(() => parseSize('-5 kB')).toThrow())
})

it('skips brotli when no budget needs it', () => {
  const size = measure('a.js', 'z'.repeat(5000), ['gzip'])
  expect(size.brotli).toBe(size.gzip)
})

it('reuses measurements for unchanged content', () => {
  const cached = createMeasureCache()
  const a = cached('a-1.js', 'q'.repeat(1000), ['gzip'])
  const b = cached('a-2.js', 'q'.repeat(1000), ['gzip'])
  expect(b).toEqual({ ...a, file: 'a-2.js' })
})
