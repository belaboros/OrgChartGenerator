/**
 * File System Access adapter — the shipped one.
 *
 * Chrome/Edge only, deliberately and with no fallback (#21 Q4): Safari and Firefox
 * implement none of the pickers, and a download/upload fallback would break the
 * one-file-per-view workflow that #18 exists for by turning every save into a
 * download plus a manual file move.
 */
import yaml from 'js-yaml'
import { parseYaml } from './yaml'
import { FileAccessError } from './types'
import type { Files, OrgDoc, RawEmployeesFile, RawTeamsFile, ViewDoc } from './types'
import { orgPrefixes, viewNames } from './pairs'

const DB = 'orgchart-workbench'
const STORE = 'handles'
const KEY = 'workingDirectory'

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}

async function remember(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await idb()
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(handle, KEY)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    // Remembering is a convenience. Failing to remember is not failing.
  }
}

async function recall(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await idb()
    return await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(KEY)
      req.onsuccess = () => res((req.result as FileSystemDirectoryHandle) ?? null)
      req.onerror = () => rej(req.error)
    })
  } catch {
    return null
  }
}

/** Directory access does not survive a reload on its own; permission must be re-granted. */
async function stillAllowed(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

export async function pickWorkingDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!isSupported()) {
    throw new FileAccessError(
      'This workbench needs the File System Access API, which today means Chrome or Edge. ' +
        'Safari and Firefox cannot open a folder or write back to it.',
    )
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'orgchart-workbench' })
  await remember(handle)
  return handle
}

/** Returns the remembered directory if permission is still (or again) granted. */
export async function restoreWorkingDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await recall()
  if (!handle) return null
  return (await stillAllowed(handle)) ? handle : null
}

export function createFsaFiles(dir: FileSystemDirectoryHandle): Files {
  const names = async (): Promise<string[]> => {
    const out: string[] = []
    for await (const [name, entry] of dir.entries()) {
      if (entry.kind === 'file') out.push(name)
    }
    return out
  }

  const readText = async (name: string): Promise<string> => {
    try {
      const fh = await dir.getFileHandle(name)
      return await (await fh.getFile()).text()
    } catch {
      throw new FileAccessError(`Could not read ${name}`)
    }
  }

  const writeText = async (name: string, text: string): Promise<void> => {
    const fh = await dir.getFileHandle(name, { create: true })
    const w = await fh.createWritable()
    await w.write(text)
    await w.close()
  }

  return {
    async listOrgs() {
      return orgPrefixes(await names())
    },
    async loadOrg(prefix) {
      const [teamsText, employeesText] = await Promise.all([
        readText(`${prefix}-teams.yaml`),
        readText(`${prefix}-employees.yaml`),
      ])
      return {
        prefix,
        teams: parseYaml<RawTeamsFile>(teamsText, `${prefix}-teams.yaml`),
        employees: parseYaml<RawEmployeesFile>(employeesText, `${prefix}-employees.yaml`),
      } satisfies OrgDoc
    },
    async listViews(prefix) {
      return viewNames(await names(), prefix)
    },
    async loadView(name) {
      return parseYaml<ViewDoc>(await readText(name), name)
    },
    async saveView(name, doc) {
      await writeText(name, yaml.dump(doc, { lineWidth: 100, noRefs: true }))
    },
    async exportPng(bytes, name) {
      // A save picker rather than a silent write: an exported image is a deliberate act.
      const fh = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      })
      const w = await fh.createWritable()
      await w.write(bytes)
      await w.close()
    },
  }
}
