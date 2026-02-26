// Single-page app (React/Vue/Svelte): watch what users wait for, keep lazy routes in check.
import { defineConfig } from 'vite'
import sizeBudget from 'vite-plugin-size-budget'

export default defineConfig({
  plugins: [
    sizeBudget({
      compression: 'brotli',
      budgets: [
        { path: '@initial', max: '150 kB', maxIncrease: '3%' },
        { path: '@lazy', max: '500 kB', maxFile: '100 kB' },
        { path: '@css', max: '30 kB' },
        { path: '@fonts', max: '120 kB', compression: 'none' }, // fonts are already compressed
      ],
      baseline: 'baseline/size-report.json',
      markdownFile: 'size.md',
      htmlFile: 'dist/size-report.html',
    }),
  ],
})
