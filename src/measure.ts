import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

export type Compression = 'none' | 'gzip' | 'brotli'

export interface FileSize {
  file: string
  none: number
  gzip: number
  brotli: number
}

export function measure(file: string, content: string | Uint8Array): FileSize {
  const buffer = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content.buffer, content.byteOffset, content.byteLength)
  return {
    file,
    none: buffer.byteLength,
    gzip: gzipSync(buffer, { level: 9 }).byteLength,
    brotli: brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
  }
}
