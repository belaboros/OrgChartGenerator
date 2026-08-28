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

/**
 * Which of the two arrangements a View uses (#33).
 *
 * Both draw the SAME containment tree — `nested` is not "not a tree" — they differ
 * only in HOW they draw it: boxes inside boxes, or boxes joined by lines. This is
 * what v1 called an Encoding; that word is retired.
 */
export type Arrangement = 'nested' | 'tree'

/** `ellipse`, not `circle` (#33): an `<ellipse>` inscribed in the box is what it has always drawn. */
export type ShapeKind = 'rectangle' | 'ellipse'

/**
 * How sibling Teams flow. TRANSITIONAL (#33).
 *
 * v1 carried one union across both arrangements, which is exactly what forced the
 * silent `radial -> fit` coercion the pairing table in `layout.ts` documents. #34
 * and #35 dismantle it into tree's `direction` and nested's `wrap`; until then it
 * is named for what it is rather than squatting on the word `Arrangement`.
 */
export type Flow =
  | 'fit'
  | 'left-to-right'
  | 'top-to-bottom'
  | 'radial'
  | `grid-${number}x${number}`

/** Which way the `tree` arrangement grows. */
export type TreeDirection = 'left-to-right' | 'top-to-bottom' | 'radial'

/**
 * Where a row of sibling Teams breaks, in the `nested` arrangement.
 *
 * Not a direction, deliberately (#34): `fit` chooses no direction at all, it wraps
 * toward the window's aspect ratio. The other two wrap at a real window edge — the
 * right edge and the bottom respectively.
 */
export type NestedWrap =
  | 'fit'
  | 'left-to-right-then-top-to-bottom'
  | 'top-to-bottom-then-left-to-right'

/**
 * Every arrangement option a View carries (#34).
 *
 * BOTH tabs are persisted, not just the active one, so browsing to the other tab
 * and back does not silently reset what you had set up there.
 *
 * The two tabs are deliberately asymmetric: tree's control is a *direction* and
 * composes with `packSubtrees`, while nested's is a *wrap rule* whose values are
 * mutually exclusive. Forcing one word onto both is what produced v1's silent
 * `radial -> fit` coercion.
 */
export interface ArrangementDoc {
  /** Which tab applies. The others keep their settings for when they are chosen. */
  active: Arrangement
  /** Global (#34): one Shape for the whole View, read by arrange, not a style layer. */
  shape: ShapeKind
  tree: {
    direction: TreeDirection
    /** Lay each top-level subtree out as a block and pack the blocks to the window. */
    packSubtrees: boolean
  }
  nested: {
    wrap: NestedWrap
    /**
     * Reorders child Teams tallest-first so rows stop being padded out by one tall
     * member (#42). NOT area minimisation, which is what it used to be called and
     * what it turned out to do badly: minimising area alone produced a 706x7331
     * tower on acme-large, rendering every shape at a third its size (#38). This
     * keeps the wrap's own objective and only changes the ORDER. Source order is
     * lost when true.
     */
    reorderToFill: boolean
  }
}

/**
 * Properties a Team-cascade layer may carry (#18).
 *
 * `shape` is NOT one of them any more (#34): it became a single global setting at
 * `arrangement.shape`, because arrange has to read it — child Teams are packed
 * inside their parent's Shape, and a per-layer override would pack as one shape
 * and draw as another. Note the cascade layer named `shape` in `style` is a
 * different thing entirely: it is keyed by Team Path. With the property gone, that
 * name means only the layer.
 */
export interface TeamStyle {
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
  /**
   * v3 (#42). Older versions are REJECTED BY NAME, never upconverted — a reader
   * that knows what a v2 file is can say so, where a bare unknown-key error tells
   * you nothing. That is why a key rename bumps the version rather than quietly
   * changing what `version: 2` means.
   */
  version: 3
  arrangement: ArrangementDoc
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
   * arrange command would apply NEXT, which is why a view saved after a hand-move
   * still reopens exactly as it was left. Keyed by Team Path; Positions have no
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
