import { createHash } from 'node:crypto'
import * as zlib from 'node:zlib'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export type Compression = 'none' | 'gzip' | 'brotli' | 'zstd'

export interface FileSize {
  file: string
  none: number
  gzip: number
  brotli: number
  /** Missing in reports from older versions of this plugin. */
  zstd?: number
}

/** Size of a file under a compression; old reports without zstd fall back to gzip. */
export function sizeOf(file: FileSize, compression: Compression): number {
  return file[compression] ?? file.gzip
}

// zstdCompressSync only exists on newer Node releases; fall back to gzip size elsewhere.
const zstdCompress = (zlib as unknown as { zstdCompressSync?: (b: Buffer) => Buffer }).zstdCompressSync

export function zstdAvailable(): boolean {
  return typeof zstdCompress === 'function'
}

/**
 * Measures raw size plus the requested compressions. Brotli at quality 11 is by far
 * the slowest step, so callers pass only what their budgets use; gzip is always
 * included because reports and diffs fall back to it.
 */
export function measure(file: string, content: string | Uint8Array, compressions: readonly Compression[] = ['gzip', 'brotli', 'zstd']): FileSize {
  const buffer = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content.buffer, content.byteOffset, content.byteLength)
  const gzip = gzipSync(buffer, { level: 9 }).byteLength
  const brotli = compressions.includes('brotli') ? brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength : gzip
  const zstd = compressions.includes('zstd') && zstdCompress ? zstdCompress(buffer).byteLength : gzip
  return { file, none: buffer.byteLength, gzip, brotli, zstd }
}

/**
 * Memoizes measurements by content hash, so `vite build --watch` only recompresses
 * files that actually changed between rebuilds.
 */
export function createMeasureCache(limit = 2000) {
  const cache = new Map<string, Omit<FileSize, 'file'>>()
  return (file: string, content: string | Uint8Array, compressions: readonly Compression[]): FileSize => {
    const key = createHash('sha1').update(content).update(compressions.join()).digest('hex')
    let sizes = cache.get(key)
    if (!sizes) {
      const { file: _file, ...measured } = measure(file, content, compressions)
      sizes = measured
      if (cache.size >= limit) cache.delete(cache.keys().next().value!)
      cache.set(key, sizes)
    }
    return { file, ...sizes }
  }
}
