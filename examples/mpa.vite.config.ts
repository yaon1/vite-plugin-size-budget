// Multi-page app: one budget per page via @entry:<name>.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import sizeBudget from 'vite-plugin-size-budget'

export default defineConfig({
  build: {
    rollupOptions: {
      input: { home: resolve(__dirname, 'index.html'), checkout: resolve(__dirname, 'checkout.html'), admin: resolve(__dirname, 'admin/index.html') },
    },
  },
  plugins: [
    sizeBudget({
      budgets: [
        { path: '@entry:home', max: '90 kB' },
        { path: '@entry:checkout', max: '120 kB' },
        { path: '@entry:admin', max: '400 kB' },
      ],
    }),
  ],
})
