/**
 * The file-access seam (#21).
 *
 * One narrow interface that every delivery implements: the browser build over the
 * File System Access API, and — if a desktop shell is ever built (#16, deferred in
 * #21) — the same interface over native dialogs. Nothing above this layer knows
 * which one it is talking to.
 */

/** Raw parsed YAML, straight off disk. #24 turns this into the domain model. */
export interface OrgDoc {
  prefix: string
  teams: RawTeamsFile
  employees: RawEmployeesFile
}

export interface RawTeamsFile {
  org: string
  version: number
  teams?: Record<string, RawTeam>
}

export interface RawTeam {
  teams?: Record<string, RawTeam>
  positions?: RawPosition[]
}

/** `role`, not `title` — renamed across the format in #17. */
export interface RawPosition {
  role: string
  occupant?: string
  description?: string
}

export interface RawEmployeesFile {
  org: string
  version: number
  /** Keyed by email; the format's one hard identity (#13). Open set of attributes (#9). */
  employees?: Record<string, Record<string, unknown>>
}

export type Encoding = 'enclosure' | 'node-link'
export type ShapeKind = 'rectangle' | 'circle'
export type Arrangement =
  | 'fit'
  | 'left-to-right'
  | 'top-to-bottom'
  | 'radial'
  | `grid-${number}x${number}`

/** Properties a Team-cascade layer may carry (#18). */
export interface TeamStyle {
  shape?: ShapeKind
  fill?: string
  line?: string
  border?: number
  font?: number
  text?: string
  margin?: number
}

/** Properties a Position-cascade layer may carry (#18). Positions are labels, not shapes. */
export interface PositionStyle {
  fill?: string
  text?: string
  font?: number
}

export interface Geometry {
  x: number
  y: number
  w: number
  h: number
}

/**
 * `<org-prefix>.<view-name>.view.yaml` — the format decided in #18.
 * Strict: an unknown key is an error, not a shrug.
 */
export interface ViewDoc {
  org: string
  version: 1
  encoding: Encoding
  arrangement: {
    default: Arrangement
    teamDepth?: Record<number, Arrangement>
  }
  detail: {
    positions: boolean
    occupantNames: boolean
    counts: boolean
  }
  filter?: {
    /** Absent means every Role. */
    roles?: string[]
  }
  style: {
    // Team cascade, weakest to strongest
    team?: TeamStyle
    org?: TeamStyle
    teamDepth?: Record<number, TeamStyle>
    shape?: Record<string, TeamStyle>
    // Position cascade, weakest to strongest
    position?: PositionStyle
    role?: Record<string, PositionStyle>
    occupant?: Record<string, PositionStyle>
    vacant?: PositionStyle
  }
  /**
   * Authoritative — this is what gets drawn. `arrangement` only records what the
   * arrange command would apply next. Keyed by Team Path; Positions have no
   * identity and no geometry (#13).
   */
  geometry: Record<string, Geometry>
}

export interface Files {
  /** Organization prefixes that have BOTH a -teams.yaml and a -employees.yaml. */
  listOrgs(): Promise<string[]>
  loadOrg(prefix: string): Promise<OrgDoc>
  /** View file names for one organization, e.g. `acme-large.compact.view.yaml`. */
  listViews(prefix: string): Promise<string[]>
  loadView(name: string): Promise<ViewDoc>
  saveView(name: string, doc: ViewDoc): Promise<void>
  exportPng(bytes: Blob, name: string): Promise<void>
}

export class FileAccessError extends Error {}
