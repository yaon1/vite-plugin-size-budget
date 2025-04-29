/** Minimal shape of Rollup output we need, so the graph logic stays testable without Vite. */
export interface OutputChunkLike {
  type: 'chunk'
  fileName: string
  isEntry: boolean
  name?: string
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
export function initialFiles(bundle: Record<string, OutputChunkLike | OutputAssetLike>, only?: (chunk: OutputChunkLike) => boolean): string[] {
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
    if (output.type === 'chunk' && output.isEntry && (!only || only(output))) visit(output.fileName)
  }
  return [...seen].sort()
}

const TYPES: Record<string, RegExp> = {
  js: /\.(m|c)?js$/,
  css: /\.css$/,
  images: /\.(png|jpe?g|gif|webp|avif|svg|ico)$/,
  fonts: /\.(woff2?|ttf|otf|eot)$/,
}

/** Built-in groups by file type: @js, @css, @images, @fonts. */
export function typeGroups(files: readonly string[]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(TYPES).map(([name, re]) => [name, files.filter((f) => re.test(f))]))
}

/** Chunks reachable only through dynamic import(): code users load later, on demand. */
export function lazyFiles(bundle: Record<string, OutputChunkLike | OutputAssetLike>): string[] {
  const initial = new Set(initialFiles(bundle))
  return Object.values(bundle)
    .filter((o): o is OutputChunkLike => o.type === 'chunk' && !initial.has(o.fileName))
    .map((o) => o.fileName)
    .sort()
}

/** One "@entry:<name>" group per entry, for multi-page apps with a budget per page. */
export function entryGroups(bundle: Record<string, OutputChunkLike | OutputAssetLike>): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const output of Object.values(bundle)) {
    if (output.type === 'chunk' && output.isEntry && output.name) {
      groups[`entry:${output.name}`] = initialFiles(bundle, (c) => c === output)
    }
  }
  return groups
}
