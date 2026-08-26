/**
 * Placement. This ticket (#25) needs *a* layout to have something to render;
 * the five arrangements, the depth cascade and arrange-as-a-command are #26.
 * What is settled here is the SHAPE of the output — the renderer consumes plain
 * absolute geometry and owns it thereafter, which is why no layout engine is a
 * dependency (#21).
 */
import type { Arrangement, Encoding } from '../files/types'
import type { Organization, Team } from '../model/types'
import { arrangeSiblings, arrangementFor } from './arrange'

export interface PlacedPosition {
  role: string
  occupantEmail: string | null
  occupantName: string | null
  vacant: boolean
  unresolved: boolean
}

export interface PlacedTeam {
  path: string
  name: string
  /** 0 is the organization itself; root Teams are 1. */
  depth: number
  parentPath: string | null
  x: number
  y: number
  w: number
  h: number
  positions: PlacedPosition[]
  positionCount: number
  vacantCount: number
}

export interface Placement {
  nodes: PlacedTeam[]
  width: number
  height: number
}

export interface DetailSwitches {
  positions: boolean
  occupantNames: boolean
  counts: boolean
}

export interface ArrangementCascade {
  default: Arrangement
  /** Keyed by the depth of the SIBLINGS being arranged, like the style cascade. */
  teamDepth?: Record<number, Arrangement>
}

export interface LayoutOptions {
  encoding: Encoding
  detail: DetailSwitches
  /** Absent or empty means every Role. */
  roleFilter?: ReadonlySet<string>
  arrangement: ArrangementCascade
  /** Width / height of the window the diagram has to fill. Only `fit` uses it. */
  targetAspect: number
}

const HEADER = 24
const LINE = 15
const PAD = 10
const CHAR = 6.6

export function positionLabel(p: PlacedPosition, detail: DetailSwitches): string {
  // Vacant Positions render as the Role alone — visibly distinct, by design.
  return detail.occupantNames && p.occupantName ? `${p.role}: ${p.occupantName}` : p.role
}

const visible = (t: Team, o: LayoutOptions): PlacedPosition[] => {
  if (!o.detail.positions) return []
  const all = t.positions.map((p) => ({
    role: p.role,
    occupantEmail: p.occupantEmail,
    occupantName: p.occupant?.name ?? p.occupantEmail,
    vacant: p.vacant,
    unresolved: p.unresolved,
  }))
  if (!o.roleFilter || o.roleFilter.size === 0) return all
  return all.filter((p) => o.roleFilter!.has(p.role))
}

interface Node {
  team: Team | null
  name: string
  path: string
  depth: number
  positions: PlacedPosition[]
  children: Node[]
  positionCount: number
  vacantCount: number
}

/**
 * The organization itself is a shape (#21). Every tree layout needs one root and
 * the example organizations are forests — acme-large has five root Teams — and it
 * also gives the `org` style layer something real to address.
 */
function asTree(org: Organization, o: LayoutOptions): Node {
  const conv = (t: Team, depth: number): Node => ({
    team: t,
    name: t.name,
    path: t.path,
    depth,
    positions: visible(t, o),
    children: t.children.map((c) => conv(c, depth + 1)),
    positionCount: t.positionCount,
    vacantCount: t.vacantCount,
  })
  return {
    team: null,
    name: org.name,
    path: org.name,
    depth: 0,
    positions: [],
    children: org.roots.map((r) => conv(r, 1)),
    positionCount: 0,
    vacantCount: 0,
  }
}

const ownHeight = (n: Node, o: LayoutOptions): number =>
  HEADER + n.positions.length * LINE + (o.detail.counts ? LINE : 0)

const ownWidth = (n: Node, o: LayoutOptions): number =>
  Math.max(
    120,
    n.name.length * CHAR + 24,
    ...n.positions.map((p) => positionLabel(p, o.detail).length * CHAR + 20),
    o.detail.counts ? 150 : 0,
  )

interface Box {
  n: Node
  w: number
  h: number
  contentTop: number
  kids: (Box & { rx: number; ry: number })[]
}

/** Nested enclosure: a Team is a shape containing its child Teams. */
function enclose(n: Node, o: LayoutOptions): Box {
  const kids = n.children.map((c) => enclose(c, o)) as (Box & { rx: number; ry: number })[]
  const own = ownHeight(n, o)

  let innerW = 0
  let innerH = 0
  if (kids.length) {
    // Children of a node at depth d are themselves at depth d+1, and that is the
    // depth their arrangement is keyed by.
    // There is no enclosure form of `radial`, so it falls back to `fit` — the
    // useful default — rather than silently becoming left-to-right.
    const chosen = arrangementFor(o.arrangement, n.depth + 1)
    const arrangement = chosen === 'radial' ? 'fit' : chosen
    const { placed, w, h } = arrangeSiblings(kids, arrangement, o.targetAspect)
    for (let i = 0; i < kids.length; i++) {
      kids[i]!.rx = placed[i]!.rx
      kids[i]!.ry = placed[i]!.ry
    }
    innerW = w
    innerH = h
  }

  return {
    n,
    w: Math.max(ownWidth(n, o), innerW) + PAD * 2,
    h: own + innerH + PAD * 2 + (kids.length ? 4 : 0),
    contentTop: own + PAD,
    kids,
  }
}

function flatten(b: Box, ox: number, oy: number, parent: string | null, out: PlacedTeam[]): void {
  out.push({
    path: b.n.path,
    name: b.n.name,
    depth: b.n.depth,
    parentPath: parent,
    x: ox,
    y: oy,
    w: b.w,
    h: b.h,
    positions: b.n.positions,
    positionCount: b.n.positionCount,
    vacantCount: b.n.vacantCount,
  })
  for (const k of b.kids) flatten(k, ox + PAD + k.rx, oy + b.contentTop + k.ry, b.n.path, out)
}


/**
 * Radial: a ring per depth.
 *
 * Angles go to every LEAF, sized by the angular width the box actually needs at
 * its own radius; internal nodes sit at the mean of their children. Allocating by
 * leaf COUNT instead is what overlaps, because a wedge can be narrower than the
 * box that has to sit in it — that cost three attempts to learn (#20), and #15
 * found the same thing independently in d3.
 */
function radial(root: Node, o: LayoutOptions): PlacedTeam[] {
  interface R {
    n: Node
    w: number
    h: number
    kids: R[]
    depth: number
    angle: number
  }
  const measure = (n: Node, depth: number): R => ({
    n,
    w: Math.max(140, ownWidth(n, o)),
    h: ownHeight(n, o) + PAD,
    kids: n.children.map((c) => measure(c, depth + 1)),
    depth,
    angle: 0,
  })
  const root2 = measure(root, 0)

  const byDepth: R[][] = []
  const collect = (b: R): void => {
    ;(byDepth[b.depth] ??= []).push(b)
    b.kids.forEach(collect)
  }
  collect(root2)

  const GAPA = 26
  const radii = byDepth.map((row, d) => {
    if (d === 0) return 0
    const need = row.reduce((a, b) => a + b.w + GAPA, 0) / (2 * Math.PI)
    return Math.max(d * 240, need)
  })

  const leaves: R[] = []
  const gather = (b: R): void => {
    if (b.kids.length) b.kids.forEach(gather)
    else leaves.push(b)
  }
  gather(root2)

  const need = (b: R): number => (b.w + GAPA) / Math.max(1, radii[b.depth] ?? 1)
  const total = leaves.reduce((a, b) => a + need(b), 0)
  let acc = -Math.PI / 2
  for (const b of leaves) {
    const share = (need(b) / total) * 2 * Math.PI
    b.angle = acc + share / 2
    acc += share
  }
  const setAngle = (b: R): number => {
    if (!b.kids.length) return b.angle
    const as = b.kids.map(setAngle)
    b.angle = as.reduce((a, x) => a + x, 0) / as.length
    return b.angle
  }
  setAngle(root2)

  const radiusOf = new Map<string, number>()
  const flat: R[] = []
  const walk = (b: R): void => {
    radiusOf.set(b.n.path, radii[b.depth] ?? 0)
    flat.push(b)
    b.kids.forEach(walk)
  }
  walk(root2)

  const box = (b: R): { x: number; y: number; w: number; h: number } => {
    const r = radiusOf.get(b.n.path) ?? 0
    return { x: Math.cos(b.angle) * r - b.w / 2, y: Math.sin(b.angle) * r - b.h / 2, w: b.w, h: b.h }
  }
  const hits = (a: { x: number; y: number; w: number; h: number }, c: { x: number; y: number; w: number; h: number }): boolean =>
    a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h

  // Overlaps survive angle allocation because a box is a box, not a point: two
  // boxes on adjacent rings can collide however the angles are shared out. Relax
  // RADIALLY — keep every angle, push the outer box of a colliding pair further
  // out — so the ring structure and parent-over-children ordering both survive.
  for (let pass = 0; pass < 60; pass++) {
    let moved = 0
    for (let i = 0; i < flat.length; i++) {
      for (let j = i + 1; j < flat.length; j++) {
        const a = flat[i]!
        const c = flat[j]!
        const ba = box(a)
        const bc = box(c)
        if (!hits(ba, bc)) continue
        const outer = (radiusOf.get(a.n.path) ?? 0) >= (radiusOf.get(c.n.path) ?? 0) ? a : c
        const ox = Math.min(ba.x + ba.w, bc.x + bc.w) - Math.max(ba.x, bc.x)
        const oy = Math.min(ba.y + ba.h, bc.y + bc.h) - Math.max(ba.y, bc.y)
        radiusOf.set(outer.n.path, (radiusOf.get(outer.n.path) ?? 0) + Math.max(6, Math.min(ox, oy) * 0.6))
        moved++
      }
    }
    if (!moved) break
  }

  const parentOf = new Map<string, string | null>()
  const link = (b: R, parent: string | null): void => {
    parentOf.set(b.n.path, parent)
    b.kids.forEach((k) => link(k, b.n.path))
  }
  link(root2, null)

  const out: PlacedTeam[] = flat.map((b) => {
    const g = box(b)
    return {
      path: b.n.path,
      name: b.n.name,
      depth: b.n.depth,
      parentPath: parentOf.get(b.n.path) ?? null,
      x: g.x,
      y: g.y,
      w: g.w,
      h: g.h,
      positions: b.n.positions,
      positionCount: b.n.positionCount,
      vacantCount: b.n.vacantCount,
    }
  })
  const minX = Math.min(...out.map((n) => n.x))
  const minY = Math.min(...out.map((n) => n.y))
  for (const n of out) {
    n.x -= minX - 20
    n.y -= minY - 20
  }
  return out
}

interface M {
  n: Node
  w: number
  h: number
  kids: M[]
  span: number
}

const HG = 70
const VG = 16

function measureNodeLink(n: Node, o: LayoutOptions): M {
  return {
    n,
    w: Math.max(140, ownWidth(n, o)),
    h: ownHeight(n, o) + PAD,
    kids: n.children.map((c) => measureNodeLink(c, o)),
    span: 0,
  }
}

function spanOf(b: M, vertical: boolean): number {
  const self = vertical ? b.w : b.h
  if (!b.kids.length) return (b.span = self)
  b.span = Math.max(self, b.kids.reduce((a, k) => a + spanOf(k, vertical) + VG, -VG))
  return b.span
}

/** Places one subtree with its own origin at (0,0) and reports the block it occupies. */
function placeSubtree(
  b: M,
  vertical: boolean,
  parent: string | null,
): { nodes: PlacedTeam[]; w: number; h: number } {
  spanOf(b, vertical)
  const nodes: PlacedTeam[] = []
  const go = (m: M, along: number, across: number, p: string | null): void => {
    const self = vertical ? m.w : m.h
    nodes.push({
      path: m.n.path,
      name: m.n.name,
      depth: m.n.depth,
      parentPath: p,
      x: vertical ? along + (m.span - self) / 2 : across,
      y: vertical ? across : along + (m.span - self) / 2,
      w: m.w,
      h: m.h,
      positions: m.n.positions,
      positionCount: m.n.positionCount,
      vacantCount: m.n.vacantCount,
    })
    let t = along
    for (const k of m.kids) {
      go(k, t, across + (vertical ? m.h : m.w) + HG, m.n.path)
      t += k.span + VG
    }
  }
  go(b, 0, 0, parent)
  const w = Math.max(...nodes.map((n) => n.x + n.w))
  const h = Math.max(...nodes.map((n) => n.y + n.h))
  return { nodes, w, h }
}

/**
 * `fit` for node-link. Flowing every Team in one direction gives a 1:9 tower or a
 * 22:1 strip on acme-large, and picking the lesser of the two is still wrong — so
 * lay each top-level subtree out as a BLOCK and pack the blocks to the window's
 * aspect, exactly as enclosure's `fit` packs sibling Teams.
 */
function nodeLinkFit(root: Node, o: LayoutOptions): PlacedTeam[] {
  const m = measureNodeLink(root, o)
  if (!m.kids.length) return placeSubtree(m, false, null).nodes

  const blocks = m.kids.map((k) => placeSubtree(k, false, root.path))
  const packed = arrangeSiblings(blocks, 'fit', o.targetAspect)

  const out: PlacedTeam[] = []
  for (const b of packed.placed) {
    for (const n of b.nodes) out.push({ ...n, x: n.x + b.rx, y: n.y + b.ry })
  }
  // The organization's own shape sits to the left of the packed blocks, centred.
  const top = Math.min(...out.map((n) => n.y))
  const bottom = Math.max(...out.map((n) => n.y + n.h))
  for (const n of out) n.x += m.w + HG
  out.unshift({
    path: root.path,
    name: root.name,
    depth: 0,
    parentPath: null,
    x: 0,
    y: (top + bottom) / 2 - m.h / 2,
    w: m.w,
    h: m.h,
    positions: root.positions,
    positionCount: root.positionCount,
    vacantCount: root.vacantCount,
  })
  return out
}

/** Node-link: Teams as separate shapes joined by containment edges. */
function nodeLink(root: Node, o: LayoutOptions, vertical: boolean): PlacedTeam[] {
  return placeSubtree(measureNodeLink(root, o), vertical, null).nodes
}

const extent = (nodes: PlacedTeam[]): { width: number; height: number } => ({
  width: Math.max(...nodes.map((n) => n.x + n.w)) + 20,
  height: Math.max(...nodes.map((n) => n.y + n.h)) + 20,
})

/**
 * Not every arrangement means something in every encoding. Rather than silently
 * drawing something unintended, each pairing is decided here, once:
 *
 *   enclosure  fit | left-to-right | top-to-bottom | grid-CxR   (radial -> fit)
 *   node-link  left-to-right | top-to-bottom | radial          (grid -> left-to-right,
 *                                                                fit -> whichever of the
 *                                                                two flows fits better)
 */
export function layout(org: Organization, o: LayoutOptions): Placement {
  const root = asTree(org, o)

  if (o.encoding === 'node-link') {
    const want = o.arrangement.default
    if (want === 'radial') {
      const nodes = radial(root, o)
      return { nodes, ...extent(nodes) }
    }
    if (want === 'top-to-bottom') {
      const nodes = nodeLink(root, o, true)
      return { nodes, ...extent(nodes) }
    }
    if (want === 'left-to-right' || want.startsWith('grid-')) {
      const nodes = nodeLink(root, o, false)
      return { nodes, ...extent(nodes) }
    }
    const nodes = nodeLinkFit(root, o)
    return { nodes, ...extent(nodes) }
  }

  const encloseOnce = (opts: LayoutOptions): { nodes: PlacedTeam[]; width: number; height: number } => {
    const nodes: PlacedTeam[] = []
    flatten(enclose(asTree(org, opts), opts), 0, 0, null, nodes)
    return { nodes, ...extent(nodes) }
  }

  if (o.arrangement.default !== 'fit' && o.arrangement.default !== 'radial') return encloseOnce(o)

  /*
   * Each level packs against a target, but a parent inherits its widest child's
   * width — so per-level targeting alone cannot steer the WHOLE diagram. Layout is
   * sub-millisecond, so sweep one global bias on the per-level target and keep the
   * run whose overall aspect lands closest to the window.
   */
  let best: { nodes: PlacedTeam[]; width: number; height: number } | null = null
  let bestErr = Number.POSITIVE_INFINITY
  for (let i = 0; i <= 16; i++) {
    const bias = Math.exp((i / 16) * 2 * Math.log(6) - Math.log(6)) // 1/6 .. 6
    const candidate = encloseOnce({ ...o, targetAspect: o.targetAspect * bias })
    const err = Math.abs(Math.log(candidate.width / candidate.height / o.targetAspect))
    if (err < bestErr) {
      bestErr = err
      best = candidate
    }
    // Within 2% of the window there is nothing left to win, and each further
    // sample is a full layout of the whole organization.
    if (bestErr < 0.02) break
  }
  return best ?? encloseOnce(o)
}

export const METRICS = { HEADER, LINE, PAD }
