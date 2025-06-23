import { expect, it } from 'vitest'
import { fromLighthouse } from '../src/lighthouse.js'

it('maps Lighthouse resource sizes to groups in KiB', () => {
  expect(
    fromLighthouse([
      {
        path: '/*',
        resourceSizes: [
          { resourceType: 'script', budget: 300 },
          { resourceType: 'stylesheet', budget: 50 },
          { resourceType: 'third-party', budget: 100 },
          { resourceType: 'total', budget: 1000 },
        ],
      },
    ]),
  ).toEqual([
    { path: '@js', max: 307_200, compression: 'gzip' },
    { path: '@css', max: 51_200, compression: 'gzip' },
    { path: '**', max: 1_024_000, compression: 'gzip' },
  ])
})
