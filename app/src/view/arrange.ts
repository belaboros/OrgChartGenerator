/**
 * Sibling placement, computed in our own code — no layout engine (#21).
 *
 * Arrange is a COMMAND, not a mode: this runs once, hands back absolute geometry,
 * and the application owns it from then on. Nothing here re-runs until arrange is
 * pressed again — including the window size, which is snapshotted when the command
 * runs rather than tracked live (#35).
 *
 * v1 carried ONE union across both arrangements and coerced the pairs that made no
 * sense. #35 replaced it with the three wrap modes below, which are the only ways a
 * row of siblings can be broken.
 */

export interface Sized {
  w: number
  h: number
}

export interface Placed extends Sized {
  rx: number
  ry: number
}

/**
 * How a run of siblings is broken.
 *
 * `aspect` SEARCHES for the break that lands closest to a target shape — it has no
 * direction, which is exactly why `fit` is not spelled as one. The other two break
 * at a fixed limit in world units, so the same organization breaks in the same
 * place regardless of what else is on screen.
 */
export type Wrap =
  | { kind: 'aspect'; target: number }
  | { kind: 'width'; limit: number }
  | { kind: 'height'; limit: number }

export const GAP = 12

/** Greedy break along one axis: start a new run when the next child would overflow. */
function runs<T extends Sized>(kids: T[], limit: number, size: (k: T) => number): T[][] {
  const out: T[][] = []
  let run: T[] = []
  let used = 0
  for (const k of kids) {
    const add = run.length ? GAP + size(k) : size(k)
    if (run.length && used + add > limit) {
      out.push(run)
      run = [k]
      used = size(k)
    } else {
      run.push(k)
      used += add
    }
  }
  if (run.length) out.push(run)
  return out
}

/**
 * Greedy wrapping is a step function, so SEARCHING the row-width limit lands on
 * local optima — a binary search gave 1.13 at one window size and 2.26 at another
 * for the same target. Enumerating every reachable wrap instead is deterministic:
 * the distinct row widths are the cumulative widths of runs, and any limit between
 * two of them wraps identically.
 */
export function packToAspect<T extends Sized>(kids: T[], target: number): { rows: T[][]; w: number; h: number } {
  const measure = (rows: T[][]): { rows: T[][]; w: number; h: number } => ({
    rows,
    w: Math.max(...rows.map((r) => r.reduce((a, k) => a + k.w + GAP, -GAP))),
    h: rows.reduce((a, r) => a + Math.max(...r.map((k) => k.h)) + GAP, -GAP),
  })

  const candidates = new Set<number>()
  for (let i = 0; i < kids.length; i++) {
    let acc = 0
    for (let j = i; j < kids.length; j++) {
      acc += (j > i ? GAP : 0) + kids[j]!.w
      candidates.add(acc)
    }
  }
  let limits = [...candidates].sort((a, b) => a - b)
  if (limits.length > 400) {
    const step = limits.length / 400
    limits = Array.from({ length: 400 }, (_, i) => limits[Math.floor(i * step)]!)
  }

  let best = measure(runs(kids, limits[limits.length - 1] ?? 0, (k) => k.w))
  let bestErr = Number.POSITIVE_INFINITY
  for (const limit of limits) {
    const r = measure(runs(kids, limit, (k) => k.w))
    // Log space, so "twice too wide" and "twice too tall" are penalised equally.
    const err = Math.abs(Math.log(r.w / r.h / target))
    if (err < bestErr) {
      bestErr = err
      best = r
    }
  }
  return best
}

/** Lays a set of sized siblings out, returning offsets and the block they occupy. */
export function arrangeSiblings<T extends Sized>(
  kids: T[],
  wrap: Wrap,
): { placed: (T & Placed)[]; w: number; h: number } {
  if (kids.length === 0) return { placed: [], w: 0, h: 0 }

  const placed: (T & Placed)[] = []

  // Columns flow DOWN and break to the right; rows flow across and break down.
  // Everything else about the two is the same, transposed.
  if (wrap.kind === 'height') {
    const cols = runs(kids, wrap.limit, (k) => k.h)
    let x = 0
    let h = 0
    for (const col of cols) {
      let y = 0
      const colW = Math.max(...col.map((k) => k.w))
      for (const k of col) {
        placed.push({ ...k, rx: x, ry: y })
        y += k.h + GAP
      }
      h = Math.max(h, y - GAP)
      x += colW + GAP
    }
    return { placed, w: Math.max(0, x - GAP), h }
  }

  const rows =
    wrap.kind === 'aspect' ? packToAspect(kids, wrap.target).rows : runs(kids, wrap.limit, (k) => k.w)

  let y = 0
  let w = 0
  for (const row of rows) {
    let x = 0
    const rowH = Math.max(...row.map((k) => k.h))
    for (const k of row) {
      placed.push({ ...k, rx: x, ry: y })
      x += k.w + GAP
    }
    w = Math.max(w, x - GAP)
    y += rowH + GAP
  }
  return { placed, w, h: Math.max(0, y - GAP) }
}
