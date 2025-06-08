import { expect, it } from 'vitest'
import { toHtml } from '../src/html.js'
import type { Report } from '../src/report.js'

it('renders budgets with state and escapes file names', () => {
  const report: Report = {
    version: 1,
    compression: 'gzip',
    files: [{ file: 'assets/<x>.js', none: 3000, gzip: 1000, brotli: 900 }],
    budgets: [{ path: '@js', compression: 'gzip', limit: 1000, total: 950, files: [], ok: true, warning: true, oversized: [] }],
  }
  const html = toHtml(report)
  expect(html).toContain('<span class="warn" style="width:95%">')
  expect(html).toContain('assets/&lt;x&gt;.js')
  expect(html).toMatch(/^<!doctype html>/)
})
