export interface ModuleLike {
  renderedLength: number
}

export interface Contributor {
  /** npm package name, or a project-relative path for your own code. */
  name: string
  bytes: number
}

/** Package name for a module id inside node_modules (handles scopes and pnpm's nested layout). */
export function packageOf(id: string): string | null {
  const match = /.*node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id.replace(/\\/g, '/'))
  return match ? match[1]! : null
}

/** Directory a package was installed in; two different ones mean two copies in the bundle. */
export function installPathOf(id: string): string | null {
  const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/.exec(id.replace(/\\/g, '/'))
  return match ? match[1]! : null
}

/** Largest contributors by rendered (minified, uncompressed) size, packages aggregated. */
export function topContributors(chunks: { modules: Record<string, ModuleLike> }[], root: string, limit = 10): Contributor[] {
  const totals = new Map<string, number>()
  for (const chunk of chunks) {
    for (const [id, mod] of Object.entries(chunk.modules)) {
      if (mod.renderedLength === 0) continue
      const name = packageOf(id) ?? id.replace(/\\/g, '/').replace(root.replace(/\\/g, '/') + '/', '').replace(/^\0/, '')
      totals.set(name, (totals.get(name) ?? 0) + mod.renderedLength)
    }
  }
  return [...totals].map(([name, bytes]) => ({ name, bytes })).sort((a, b) => b.bytes - a.bytes).slice(0, limit)
}

/** Packages bundled from more than one install path, e.g. two lodash versions. */
export function duplicatePackages(chunks: { modules: Record<string, ModuleLike> }[]): { name: string; paths: string[] }[] {
  const paths = new Map<string, Set<string>>()
  for (const chunk of chunks) {
    for (const id of Object.keys(chunk.modules)) {
      const name = packageOf(id)
      const path = installPathOf(id)
      if (name && path) paths.set(name, (paths.get(name) ?? new Set()).add(path))
    }
  }
  return [...paths].filter(([, p]) => p.size > 1).map(([name, p]) => ({ name, paths: [...p].sort() }))
}
