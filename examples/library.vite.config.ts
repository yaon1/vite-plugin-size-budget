// Library: every output format is checked, tree-shaking regressions show up as growth.
import { defineConfig } from 'vite'
import sizeBudget from 'vite-plugin-size-budget'

export default defineConfig({
  build: { lib: { entry: 'src/index.ts', formats: ['es', 'cjs'], fileName: 'lib' } },
  plugins: [
    sizeBudget({
      name: 'my-lib',
      budgets: [{ path: '*.{js,mjs,cjs}', max: '12 kB', maxFile: '7 kB', maxIncrease: '2%' }],
      baseline: 'baseline/size-report.json',
    }),
  ],
})
