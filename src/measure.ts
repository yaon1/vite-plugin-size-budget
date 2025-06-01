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

export function measure(file: string, content: string | Uint8Array): FileSize {
  const buffer = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content.buffer, content.byteOffset, content.byteLength)
  const gzip = gzipSync(buffer, { level: 9 }).byteLength
  return {
    file,
    none: buffer.byteLength,
    gzip,
    brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
    zstd: zstdCompress ? zstdCompress(buffer).byteLength : gzip,
  }
}
