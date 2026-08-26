/**
 * `<org-prefix>.<view-name>.view.yaml` — the format decided in #18.
 *
 * Strict: an unknown key is an error naming the key, not a shrug. The file is
 * written by this app and read by this app (#18's standing constraint), so an
 * unknown key is always a bug — either a typo in a hand-edit or a version this
 * build does not understand. Silently ignoring it would make the tool look broken
 * while the file was at fault.
 */
import yaml from 'js-yaml'
import type { Arrangement, Encoding, Geometry, PositionStyle, ShapeKind, TeamStyle, ViewDoc } from '../files/types'
import type { DetailSwitches } from './layout'
import type { StyleDoc } from './cascade'

export class ViewFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ViewFileError'
  }
}

const ENCODINGS: Encoding[] = ['enclosure', 'node-link']
const SHAPES: ShapeKind[] = ['rectangle', 'circle']
const TEAM_KEYS = ['shape', 'fill', 'line', 'border', 'font', 'text', 'margin'] as const
const POSITION_KEYS = ['fill', 'text', 'font'] as const

const isArrangement = (v: unknown): v is Arrangement =>
  v === 'fit' || v === 'left-to-right' || v === 'top-to-bottom' || v === 'radial' ||
  (typeof v === 'string' && /^grid-\d+x\d+$/.test(v))

function reject(where: string, message: string): never {
  throw new ViewFileError(`${where}: ${message}`)
}

function onlyKeys(obj: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      reject(where, `unknown key "${k}". Allowed here: ${allowed.join(', ')}`)
    }
  }
}

function asObject(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) reject(where, 'expected a mapping')
  return v as Record<string, unknown>
}

function readTeamStyle(v: unknown, where: string): TeamStyle {
  const o = asObject(v, where)
  onlyKeys(o, TEAM_KEYS, where)
  if (o['shape'] !== undefined && !SHAPES.includes(o['shape'] as ShapeKind)) {
    reject(where, `shape must be one of ${SHAPES.join(', ')}`)
  }
  return o as TeamStyle
}

function readPositionStyle(v: unknown, where: string): PositionStyle {
  const o = asObject(v, where)
  onlyKeys(o, POSITION_KEYS, where)
  return o as PositionStyle
}

function readMap<T>(v: unknown, where: string, each: (x: unknown, w: string) => T): Record<string, T> {
  const o = asObject(v, where)
  const out: Record<string, T> = {}
  for (const [k, val] of Object.entries(o)) out[k] = each(val, `${where}.${k}`)
  return out
}

export interface ViewState {
  encoding: Encoding
  arrangement: { default: Arrangement; teamDepth?: Record<number, Arrangement> }
  detail: DetailSwitches
  filter: ReadonlySet<string>
  style: StyleDoc
  geometry: Record<string, Geometry>
}

/** Field order here IS the file's field order — it is meant to be read by people. */
export function toViewDoc(org: string, state: ViewState): ViewDoc {
  const round = (g: Geometry): Geometry => ({
    x: Math.round(g.x),
    y: Math.round(g.y),
    w: Math.round(g.w),
    h: Math.round(g.h),
  })
  const geometry: Record<string, Geometry> = {}
  for (const key of Object.keys(state.geometry).sort()) geometry[key] = round(state.geometry[key]!)

  const style: StyleDoc = {}
  for (const [k, v] of Object.entries(state.style)) {
    const kept = v && typeof v === 'object' ? pruneEmpty(v as object) : v
    if (kept !== undefined) (style as Record<string, unknown>)[k] = kept
  }

  const doc: ViewDoc = {
    org,
    version: 1,
    encoding: state.encoding,
    arrangement: state.arrangement,
    detail: state.detail,
    style,
    geometry,
  }
  if (state.filter.size > 0) {
    // Absent means every Role (#18); only write it when it actually narrows.
    doc.filter = { roles: [...state.filter].sort() }
  }
  return doc
}

export function serialise(doc: ViewDoc): string {
  return yaml.dump(doc, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    // Without this, js-yaml quotes the key `y` for YAML-1.1 readers that would
    // otherwise read it as boolean true. Nothing but this app reads the file, and
    // `"y": 0` in every geometry entry is a wart in something meant to be read.
    noCompatMode: true,
    // Geometry entries and style layers become one line each — 100 Teams is 100
    // lines instead of 500.
    flowLevel: 2,
  })
}

/** A layer that sets nothing is noise in a file meant to be read. */
function pruneEmpty<T extends object>(obj: T): T | undefined {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0) continue
    out[k] = v
  }
  return Object.keys(out).length ? (out as T) : undefined
}

export function parseViewDoc(raw: unknown): ViewDoc {
  const o = asObject(raw, 'file')
  onlyKeys(o, ['org', 'version', 'encoding', 'arrangement', 'detail', 'filter', 'style', 'geometry'], 'file')

  if (typeof o['org'] !== 'string') reject('org', 'expected a string')
  if (o['version'] !== 1) reject('version', `expected 1, found ${JSON.stringify(o['version'])}`)
  if (!ENCODINGS.includes(o['encoding'] as Encoding)) {
    reject('encoding', `expected one of ${ENCODINGS.join(', ')}`)
  }

  const arr = asObject(o['arrangement'], 'arrangement')
  onlyKeys(arr, ['default', 'teamDepth'], 'arrangement')
  if (!isArrangement(arr['default'])) reject('arrangement.default', 'not a known arrangement')
  let teamDepth: Record<number, Arrangement> | undefined
  if (arr['teamDepth'] !== undefined) {
    teamDepth = {}
    for (const [k, v] of Object.entries(asObject(arr['teamDepth'], 'arrangement.teamDepth'))) {
      if (!/^\d+$/.test(k)) reject(`arrangement.teamDepth.${k}`, 'depth must be a whole number')
      if (!isArrangement(v)) reject(`arrangement.teamDepth.${k}`, 'not a known arrangement')
      teamDepth[Number(k)] = v
    }
  }

  const det = asObject(o['detail'], 'detail')
  onlyKeys(det, ['positions', 'occupantNames', 'counts'], 'detail')
  for (const k of ['positions', 'occupantNames', 'counts'] as const) {
    if (typeof det[k] !== 'boolean') reject(`detail.${k}`, 'expected true or false')
  }

  let filter: ViewDoc['filter']
  if (o['filter'] !== undefined) {
    const f = asObject(o['filter'], 'filter')
    onlyKeys(f, ['roles'], 'filter')
    if (f['roles'] !== undefined) {
      if (!Array.isArray(f['roles'])) reject('filter.roles', 'expected a list')
      filter = { roles: f['roles'] as string[] }
    }
  }

  const st = asObject(o['style'], 'style')
  onlyKeys(st, ['team', 'org', 'teamDepth', 'shape', 'position', 'role', 'occupant', 'vacant'], 'style')
  const style: StyleDoc = {}
  if (st['team'] !== undefined) style.team = readTeamStyle(st['team'], 'style.team')
  if (st['org'] !== undefined) style.org = readTeamStyle(st['org'], 'style.org')
  if (st['teamDepth'] !== undefined) {
    const depths: Record<number, TeamStyle> = {}
    for (const [k, v] of Object.entries(asObject(st['teamDepth'], 'style.teamDepth'))) {
      if (!/^\d+$/.test(k)) reject(`style.teamDepth.${k}`, 'depth must be a whole number')
      depths[Number(k)] = readTeamStyle(v, `style.teamDepth.${k}`)
    }
    style.teamDepth = depths
  }
  if (st['shape'] !== undefined) style.shape = readMap(st['shape'], 'style.shape', readTeamStyle)
  if (st['position'] !== undefined) style.position = readPositionStyle(st['position'], 'style.position')
  if (st['role'] !== undefined) style.role = readMap(st['role'], 'style.role', readPositionStyle)
  if (st['occupant'] !== undefined) style.occupant = readMap(st['occupant'], 'style.occupant', readPositionStyle)
  if (st['vacant'] !== undefined) style.vacant = readPositionStyle(st['vacant'], 'style.vacant')

  const geometry: Record<string, Geometry> = {}
  for (const [k, v] of Object.entries(asObject(o['geometry'], 'geometry'))) {
    const g = asObject(v, `geometry.${k}`)
    onlyKeys(g, ['x', 'y', 'w', 'h'], `geometry.${k}`)
    for (const axis of ['x', 'y', 'w', 'h'] as const) {
      if (typeof g[axis] !== 'number') reject(`geometry.${k}.${axis}`, 'expected a number')
    }
    geometry[k] = g as unknown as Geometry
  }

  return {
    org: o['org'] as string,
    version: 1,
    encoding: o['encoding'] as Encoding,
    arrangement: teamDepth ? { default: arr['default'], teamDepth } : { default: arr['default'] },
    detail: det as unknown as DetailSwitches,
    ...(filter ? { filter } : {}),
    style,
    geometry,
  }
}

export function viewFileName(prefix: string, viewName: string): string {
  return `${prefix}.${viewName}.view.yaml`
}

/** `acme-large.compact.view.yaml` -> `compact` */
export function viewNameOf(prefix: string, fileName: string): string {
  return fileName.slice(prefix.length + 1, -'.view.yaml'.length)
}
