# vite-plugin-size-budget

Keep your bundle honest. Fails the Vite build when gzip/brotli sizes exceed a budget, writes a JSON report and posts a diff table to the GitHub Actions job summary.

```
vite v6 building for production...
  ✓ assets/*.js (gzip): 48.12 kB / 120.00 kB
  ✗ assets/*.css (gzip): 21.40 kB / 20.00 kB — over by 1.40 kB
error during build: Size budget exceeded: assets/*.css
```

## Install

```bash
npm i -D vite-plugin-size-budget
```

```ts
// vite.config.ts
import sizeBudget from 'vite-plugin-size-budget'

export default defineConfig({
  plugins: [
    sizeBudget({
      budgets: [
        { path: 'assets/index-*.js', max: '80 kB' },            // entry chunk
        { path: 'assets/*.js', max: '250 kB' },                 // all JS
        { path: 'assets/*.css', max: '20 kB', compression: 'brotli' },
      ],
    }),
  ],
})
```

## Options

| Option | Default | |
|---|---|---|
| `budgets` | — | `{ path: glob, max: '150 kB' \| bytes, compression? }[]`; the sum of matched files is checked |
| `compression` | `'gzip'` | `'none' \| 'gzip' \| 'brotli'` |
| `failOnExceed` | `true` in CI | Otherwise only warns |
| `reportFile` | `size-report.json` | JSON report path, `false` to disable |
| `baseline` | — | Previous report to diff against |
| `githubSummary` | `true` | Append a markdown table to `$GITHUB_STEP_SUMMARY` |

Sizes accept `B`, `kB`, `KiB`, `MB`, `MiB`.

## Diff against main in CI

```yaml
- uses: actions/download-artifact@v4
  with: { name: size-report, path: baseline }
  continue-on-error: true   # first run has no baseline
- run: npm run build        # with baseline: 'baseline/size-report.json'
- uses: actions/upload-artifact@v4
  if: github.ref == 'refs/heads/main'
  with: { name: size-report, path: size-report.json }
```

The job summary then shows each budget's change and the ten files that changed most. Content hashes are stripped so `index-B3Np.js` matches `index-Xy9z.js`.

## License

MIT
