import { sizeOf } from './measure.js'
import type { Report } from './report.js'
import { formatBytes } from './size.js'

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Self-contained HTML page: budgets with usage bars and a sortable-at-a-glance file list. */
export function toHtml(report: Report, title = 'Bundle size report'): string {
  const files = [...report.files].sort((a, b) => sizeOf(b, report.compression) - sizeOf(a, report.compression))
  const max = Math.max(1, ...files.map((f) => sizeOf(f, report.compression)))
  const budgets = report.budgets
    .map((b) => {
      const pct = Math.min(100, Math.round((b.total / b.limit) * 100))
      const state = !b.ok ? 'bad' : b.warning ? 'warn' : 'ok'
      return `<tr><td><code>${escape(b.path)}</code></td><td>${formatBytes(b.total)} / ${formatBytes(b.limit)}</td><td class="bar"><span class="${state}" style="width:${pct}%"></span></td><td>${pct}%</td></tr>`
    })
    .join('')
  const rows = files
    .map((f) => {
      const size = sizeOf(f, report.compression)
      return `<tr><td><code>${escape(f.file)}</code></td><td>${formatBytes(f.none)}</td><td>${formatBytes(size)}</td><td class="bar"><span style="width:${(size / max) * 100}%"></span></td></tr>`
    })
    .join('')

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#1b1f24;--muted:#5f6b7a;--line:#e3e6eb;--bar:#3b5bdb;--ok:#2b8a3e;--warn:#e67700;--bad:#c92a2a}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8eaee;--muted:#9aa4b2;--line:#2c313a;--bar:#748ffc}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:960px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:12px 0 32px}
td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;font-variant-numeric:tabular-nums}
th{color:var(--muted);font-weight:600}.bar{width:35%}.bar span{display:block;height:8px;border-radius:4px;background:var(--bar)}
.bar .ok{background:var(--ok)}.bar .warn{background:var(--warn)}.bar .bad{background:var(--bad)}code{word-break:break-all}
</style></head><body><main>
<h1>${escape(title)}</h1>
<h2>Budgets (${report.compression})</h2>
<table><tr><th>Budget</th><th>Size</th><th></th><th></th></tr>${budgets}</table>
${
  report.contributors?.length
    ? `<h2>Largest contributors</h2><table><tr><th>Module</th><th>Minified</th></tr>${report.contributors.map((c) => `<tr><td><code>${escape(c.name)}</code></td><td>${formatBytes(c.bytes)}</td></tr>`).join('')}</table>`
    : ''
}
${report.duplicates?.length ? `<p><strong>Bundled more than once:</strong> ${report.duplicates.map((d) => `<code>${escape(d.name)}</code>`).join(', ')}</p>` : ''}
<h2>Files</h2>
<table><tr><th>File</th><th>Raw</th><th>${report.compression}</th><th></th></tr>${rows}</table>
</main></body></html>
`
}
