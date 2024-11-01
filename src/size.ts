const UNITS: Record<string, number> = { b: 1, kb: 1000, kib: 1024, mb: 1000 ** 2, mib: 1024 ** 2 }

/** Parses "150 kB", "1.5MiB" or a plain byte count. */
export function parseSize(input: string | number): number {
  if (typeof input === 'number') return input
  const match = /^\s*([\d.]+)\s*([a-z]*)\s*$/i.exec(input)
  const unit = UNITS[(match?.[2] || 'b').toLowerCase()]
  if (!match || unit === undefined || Number.isNaN(Number(match[1]))) {
    throw new Error(`Invalid size "${input}". Use e.g. 150 kB, 1.2 MiB or 2048.`)
  }
  return Math.round(Number(match[1]) * unit)
}

export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  if (abs < 1000) return `${bytes} B`
  if (abs < 1000 ** 2) return `${(bytes / 1000).toFixed(2)} kB`
  return `${(bytes / 1000 ** 2).toFixed(2)} MB`
}
