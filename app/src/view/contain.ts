/**
 * What "inside" means (#45).
 *
 * The geometry the whole nesting-protection map rests on, as pure predicates with
 * no pointer handling and no React. A child is contained by its parent's **Shape**,
 * not its bounding box: under `ellipse` the box corners are outside the shape, so
 * protecting the box would allow a drag into a corner Arrange would never place a
 * child in — "inside" would then mean two different things depending on whether you
 * got there by arranging or by dragging.
 *
 * The inset is Arrange's own gap (`PAD`), so protection stops where Arrange stops.
 */
import type { ShapeKind } from '../files/types'
import type { DetailSwitches, Labelled } from './layout'
import { METRICS, labelBox } from './layout'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Two reasons this cannot be zero, and the second sets the size (#47).
 *
 * Arrange packs children FLUSH against its inset, so its output sits exactly ON the
 * boundary rather than within it.
 *
 * And a saved view stores geometry as WHOLE UNITS — `toViewDoc` rounds `x`, `y`, `w`
 * and `h` independently — so a flush edge can shift by up to 0.5 on each of the four
 * numbers a containment test compares, i.e. up to 2 units after a save and reload.
 * Measured: every committed view had exactly one Team over by exactly 1.0, which is
 * rounding, not escape. A tolerance below the format's own precision would report
 * the app's own saved output as broken.
 */
const EPS = 2

/** The region a parent's children may occupy: its box, inset by Arrange's gap. */
const region = (parent: Box, inset: number): Box => ({
  x: parent.x + inset,
  y: parent.y + inset,
  w: parent.w - inset * 2,
  h: parent.h - inset * 2,
})

const corners = (b: Box): [number, number][] => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x, b.y + b.h],
  [b.x + b.w, b.y + b.h],
]

/** Is `child` fully inside `parent`'s Shape? */
export function contains(parent: Box, shape: ShapeKind, child: Box, inset = METRICS.PAD): boolean {
  const r = region(parent, inset)
  if (r.w <= 0 || r.h <= 0) return false

  if (shape === 'rectangle') {
    return (
      child.x >= r.x - EPS &&
      child.y >= r.y - EPS &&
      child.x + child.w <= r.x + r.w + EPS &&
      child.y + child.h <= r.y + r.h + EPS
    )
  }

  // A box is inside an ellipse only if every corner is — the same test the ellipse
  // packer is verified against, so the two agree by construction.
  const a = r.w / 2 + EPS
  const b = r.h / 2 + EPS
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  return corners(child).every(([x, y]) => ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1)
}

/**
 * Where a Team's own label block sits, for the purpose of measuring whether it still
 * fits (#45).
 *
 * Under `rectangle` it is top-left, as drawn. Under `ellipse` it is treated as
 * CENTRED — the widest chord, and therefore the easiest place to fit. That is
 * deliberate: a hand-resize does not re-run the chord packer, so the band the packer
 * chose (`PlacedTeam.labelTop`) is stale the moment the box changes size. Centred is
 * the honest lower bound; see the map's fog on what a resize should do about it.
 */
const labelRegion = (box: Box, shape: ShapeKind, label: { w: number; h: number }): Box =>
  shape === 'rectangle'
    ? { x: box.x + METRICS.PAD, y: box.y + METRICS.PAD, w: label.w, h: label.h }
    : { x: box.x + (box.w - label.w) / 2, y: box.y + (box.h - label.h) / 2, w: label.w, h: label.h }

/** Would this box still hold the Team's children and its own labels? */
export function holdsContent(
  box: Box,
  shape: ShapeKind,
  children: readonly Box[],
  node: Labelled,
  detail: DetailSwitches,
): boolean {
  const label = labelBox(node, detail)
  if (!contains(box, shape, labelRegion(box, shape, label), 0)) return false
  return children.every((c) => contains(box, shape, c))
}

/**
 * The smallest a Team may be drawn (#45, anchored per #48).
 *
 * Today's shipped floor is a flat 60x34 that knows about neither children nor labels.
 *
 * **`rectangle`** resizes from the fixed top-left corner, so the answer is closed form
 * and growing always helps.
 *
 * **`ellipse`** resizes about its CENTRE (#48). Corner anchoring was dead in both
 * directions: the packer packs children flush against the chord, so growing a
 * corner-anchored ellipse slides its boundary off whichever child sits near the fixed
 * corner — a child escapes at 1.1x and no larger size recovers it. About the centre,
 * growing always holds; shrinking essentially never does, because flush-packed
 * children leave no slack. Expect the floor here to be the arranged size itself.
 */
export function resizeFloor(
  box: Box,
  shape: ShapeKind,
  children: readonly Box[],
  node: Labelled,
  detail: DetailSwitches,
): { w: number; h: number } | null {
  const label = labelBox(node, detail)
  const pad = METRICS.PAD

  if (shape === 'rectangle') {
    return {
      w: Math.max(label.w + pad * 2, ...children.map((c) => c.x + c.w - box.x + pad)),
      h: Math.max(label.h + pad * 2, ...children.map((c) => c.y + c.h - box.y + pad)),
    }
  }

  // Scale about the centre at the aspect being dragged, and find the smallest that
  // holds. `null` means nothing at this anchor does — an honest answer beats an
  // invented number that a caller would build on.
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const at = (f: number): Box => ({ x: cx - (box.w * f) / 2, y: cy - (box.h * f) / 2, w: box.w * f, h: box.h * f })
  const holds = (f: number): boolean => holdsContent(at(f), shape, children, node, detail)

  let hi = 1
  for (let i = 0; i < 20 && !holds(hi); i++) hi *= 1.25
  if (!holds(hi)) return null
  let lo = 0
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (holds(mid)) hi = mid
    else lo = mid
  }
  return { w: at(hi).w, h: at(hi).h }
}

/**
 * Every Team drawn outside its parent's Shape (#47).
 *
 * Arrange's output is contained by construction, so anything this finds came from
 * hand-placed geometry — either a drag in this session or a view saved before
 * nesting protection existed. `tree` is excluded: children are never inside their
 * parent there.
 */
export function outOfBounds(
  nodes: readonly (Box & { path: string; parentPath: string | null })[],
  arrangement: 'nested' | 'tree',
  shape: ShapeKind,
): string[] {
  if (arrangement !== 'nested') return []
  const by = new Map(nodes.map((n) => [n.path, n]))
  return nodes
    .filter((n) => {
      const parent = n.parentPath ? by.get(n.parentPath) : undefined
      return parent !== undefined && !contains(parent, shape, n)
    })
    .map((n) => n.path)
}

/**
 * Do two sibling Shapes overlap?
 *
 * Siblings are compared as they are DRAWN, which is why this cannot be a box test
 * under `ellipse`: the chord packer lays a row flush across the widest chord it
 * fits in, so the BOXES of two ellipses in one row routinely overlap while the
 * ellipses themselves have visible space between them. A box test would report
 * those as clashes and hold a drag against a wall the user cannot see.
 *
 * The tolerance is the same `EPS` the containment tests use, for the same reason: a
 * saved view rounds every coordinate to a whole unit, so shapes Arrange left with a
 * clean `GAP` between them can come back appearing to bite into each other. Below
 * that, this reports no overlap.
 */
export function overlaps(a: Box, b: Box, shape: ShapeKind): boolean {
  if (shape === 'rectangle') {
    return (
      Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS &&
      Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > EPS
    )
  }

  // Both Shapes shrink by half the tolerance, so a pair that bites in by less than
  // EPS in total still counts as clear — the rectangle branch's rule, restated for
  // radii.
  const ax = a.w / 2 - EPS / 2
  const ay = a.h / 2 - EPS / 2
  const bx = b.w / 2 - EPS / 2
  const by = b.h / 2 - EPS / 2
  if (ax <= 0 || ay <= 0 || bx <= 0 || by <= 0) return false

  /*
   * Scale the plane by `a`'s radii. `a` becomes the unit circle and `b` stays an
   * axis-aligned ellipse — anisotropic scaling along the axes cannot tilt it — so
   * the question reduces to whether `b` comes within 1 of the origin. Both signs
   * fold away, because an axis-aligned ellipse is symmetric about both axes.
   */
  const cx = Math.abs(b.x + b.w / 2 - (a.x + a.w / 2)) / ax
  const cy = Math.abs(b.y + b.h / 2 - (a.y + a.h / 2)) / ay
  return distanceToEllipse(cx, cy, bx / ax, by / ay) <= 1
}

/**
 * Distance from a point in the first quadrant to an axis-aligned ellipse centred on
 * the origin; 0 when the point is inside it.
 *
 * Bisected on the parametric angle rather than solved: the closed form is a quartic
 * root, while the squared distance's derivative is `<= 0` at `t = 0` and `>= 0` at
 * `t = PI/2` for every point in the quadrant, so the nearest point is the one sign
 * change between them. 40 halvings put the answer far below the `EPS` it is
 * compared against, and this runs over a Team's siblings, not the whole diagram.
 */
function distanceToEllipse(px: number, py: number, rx: number, ry: number): number {
  if ((px / rx) ** 2 + (py / ry) ** 2 <= 1) return 0
  let lo = 0
  let hi = Math.PI / 2
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2
    const c = Math.cos(t)
    const s = Math.sin(t)
    // Half the derivative of the squared distance at `t`.
    if ((ry * ry - rx * rx) * s * c + px * rx * s - py * ry * c < 0) lo = t
    else hi = t
  }
  const t = (lo + hi) / 2
  return Math.hypot(rx * Math.cos(t) - px, ry * Math.sin(t) - py)
}
