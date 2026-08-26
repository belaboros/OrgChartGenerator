/**
 * DEV-ONLY adapter. Reads the repository root over the Vite dev server.
 *
 * It exists for one reason: the File System Access adapter cannot be driven
 * headlessly, because `showDirectoryPicker` requires a real user gesture. This
 * lets the seam and everything above it be tested without a human clicking a
 * picker — and, incidentally, proves the seam is a seam by having two
 * implementations of it. Never reachable in a production build.
 */
import yaml from 'js-yaml'
import { parseYaml } from './yaml'
import { FileAccessError } from './types'
import type { Files, OrgDoc, RawEmployeesFile, RawTeamsFile, ViewDoc } from './types'
import { orgPrefixes, viewNames } from './pairs'

const list = async (): Promise<string[]> => {
  const r = await fetch('/__repo/list')
  if (!r.ok) throw new FileAccessError('dev file server unavailable')
  return (await r.json()) as string[]
}

const text = async (name: string): Promise<string> => {
  const r = await fetch(`/__repo/file/${encodeURIComponent(name)}`)
  if (!r.ok) throw new FileAccessError(`Could not read ${name}`)
  return await r.text()
}

export function createHttpFiles(): Files {
  const written = new Map<string, string>()
  return {
    async listOrgs() {
      return orgPrefixes(await list())
    },
    async loadOrg(prefix) {
      const [t, e] = await Promise.all([text(`${prefix}-teams.yaml`), text(`${prefix}-employees.yaml`)])
      return {
        prefix,
        teams: parseYaml<RawTeamsFile>(t, `${prefix}-teams.yaml`),
        employees: parseYaml<RawEmployeesFile>(e, `${prefix}-employees.yaml`),
      } satisfies OrgDoc
    },
    async listViews(prefix) {
      return viewNames([...(await list()), ...written.keys()], prefix)
    },
    async loadView(name) {
      const raw = written.get(name) ?? (await text(name))
      return parseYaml<ViewDoc>(raw, name)
    },
    async saveView(name, doc) {
      // In-memory: the dev adapter never writes to the repo.
      written.set(name, yaml.dump(doc, { lineWidth: 100, noRefs: true }))
    },
    async exportPng(bytes, name) {
      // Kept in memory and exposed for verification; the dev adapter never writes
      // to the repository.
      const w = window as unknown as { __lastExport?: { name: string; bytes: ArrayBuffer } }
      w.__lastExport = { name, bytes: await bytes.arrayBuffer() }
    },
  }
}
