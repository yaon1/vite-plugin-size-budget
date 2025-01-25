/** Minimal shape of Rollup output we need, so the graph logic stays testable without Vite. */
export interface OutputChunkLike {
  type: 'chunk'
  fileName: string
  isEntry: boolean
  isDynamicEntry?: boolean
  imports: string[]
  viteMetadata?: { importedCss: Set<string> }
}
export interface OutputAssetLike {
  type: 'asset'
  fileName: string
}

/**
 * Files the browser must download before the entry can run: entry chunks, everything
 * they import statically (transitively) and their CSS. Lazy `import()` chunks are excluded,
 * which is what makes this the number users actually wait for.
 */
export function initialFiles(bundle: Record<string, OutputChunkLike | OutputAssetLike>): string[] {
  const seen = new Set<string>()
  const visit = (fileName: string) => {
    const chunk = bundle[fileName]
    if (!chunk || seen.has(fileName)) return
    seen.add(fileName)
    if (chunk.type !== 'chunk') return
    chunk.viteMetadata?.importedCss.forEach((css) => seen.add(css))
    chunk.imports.forEach(visit)
  }
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk' && output.isEntry) visit(output.fileName)
  }
  return [...seen].sort()
}
