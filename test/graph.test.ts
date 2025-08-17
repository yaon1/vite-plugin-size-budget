import { expect, it } from 'vitest'
import { entryGroups, initialFiles, lazyFiles, typeGroups, type OutputAssetLike, type OutputChunkLike } from '../src/graph.js'

const chunk = (fileName: string, imports: string[] = [], css: string[] = [], isEntry = false): OutputChunkLike => ({
  type: 'chunk',
  fileName,
  isEntry,
  imports,
  viteMetadata: { importedCss: new Set(css) },
})
const asset = (fileName: string): OutputAssetLike => ({ type: 'asset', fileName })

it('follows static imports from entries and skips lazy chunks', () => {
  const bundle = {
    'index.js': chunk('index.js', ['vendor.js'], ['index.css'], true),
    'vendor.js': chunk('vendor.js', ['shared.js']),
    'shared.js': chunk('shared.js'),
    'admin.js': chunk('admin.js', ['shared.js'], ['admin.css']), // reached only via import()
    'index.css': asset('index.css'),
    'admin.css': asset('admin.css'),
  }
  expect(initialFiles(bundle)).toEqual(['index.css', 'index.js', 'shared.js', 'vendor.js'])
})

it('handles cycles', () => {
  expect(initialFiles({ 'a.js': chunk('a.js', ['b.js'], [], true), 'b.js': chunk('b.js', ['a.js']) })).toEqual(['a.js', 'b.js'])
})

it('groups files by type', () => {
  expect(typeGroups(['a.js', 'b.mjs', 'c.css', 'd.woff2', 'e.svg', 'f.json'])).toEqual({
    js: ['a.js', 'b.mjs'],
    css: ['c.css'],
    images: ['e.svg'],
    fonts: ['d.woff2'],
  })
})

it('lists lazy chunks', () => {
  const bundle = {
    'index.js': chunk('index.js', [], [], true),
    'admin.js': chunk('admin.js'),
  }
  expect(lazyFiles(bundle)).toEqual(['admin.js'])
})

it('builds one group per entry', () => {
  const bundle = {
    'home.js': { ...chunk('home.js', ['shared.js'], [], true), name: 'home' },
    'admin.js': { ...chunk('admin.js', ['shared.js', 'charts.js'], [], true), name: 'admin' },
    'shared.js': chunk('shared.js'),
    'charts.js': chunk('charts.js'),
  }
  expect(entryGroups(bundle)).toEqual({ 'entry:home': ['home.js', 'shared.js'], 'entry:admin': ['admin.js', 'charts.js', 'shared.js'] })
})

it('ignores imports that point outside the bundle', () => {
  expect(initialFiles({ 'a.js': chunk('a.js', ['external.js'], [], true) })).toEqual(['a.js'])
})
