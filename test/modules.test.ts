import { describe, expect, it } from 'vitest'
import { duplicatePackages, packageOf, topContributors, type ModuleLike } from '../src/modules.js'

describe('packageOf', () => {
  it.each([
    ['/app/node_modules/vue/dist/vue.runtime.esm-bundler.js', 'vue'],
    ['/app/node_modules/@vue/shared/dist/shared.esm-bundler.js', '@vue/shared'],
    ['/app/node_modules/.pnpm/lodash-es@4.17.21/node_modules/lodash-es/debounce.js', 'lodash-es'],
    ['/app/src/main.ts', null],
  ])('%s → %s', (id, name) => expect(packageOf(id)).toBe(name))
})

const chunks: { modules: Record<string, ModuleLike> }[] = [
  {
    modules: {
      '/app/node_modules/vue/dist/a.js': { renderedLength: 30_000 },
      '/app/node_modules/vue/dist/b.js': { renderedLength: 20_000 },
      '/app/src/App.vue': { renderedLength: 4_000 },
      '/app/node_modules/date-fns/index.js': { renderedLength: 70_000 },
    },
  },
  {
    modules: {
      '/app/node_modules/chart/node_modules/date-fns/index.js': { renderedLength: 65_000 },
      '/app/src/empty.ts': { renderedLength: 0 },
    },
  },
]

it('ranks contributors with packages aggregated', () => {
  expect(topContributors(chunks, '/app', 3)).toEqual([
    { name: 'date-fns', bytes: 135_000 },
    { name: 'vue', bytes: 50_000 },
    { name: 'src/App.vue', bytes: 4_000 },
  ])
})

it('finds packages bundled twice', () => {
  expect(duplicatePackages(chunks)).toEqual([
    { name: 'date-fns', paths: ['/app/node_modules/chart/node_modules/date-fns', '/app/node_modules/date-fns'] },
  ])
})

it('normalizes Windows paths', () => {
  expect(packageOf('C:\\app\\node_modules\\@scope\\pkg\\index.js')).toBe('@scope/pkg')
})
