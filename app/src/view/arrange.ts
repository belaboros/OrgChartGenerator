/**
 * The five arrangements (#20), computed in our own code — no layout engine (#21).
 *
 * Arrange is a COMMAND, not a mode: this runs once, hands back absolute geometry,
 * and the application owns it from then on. Nothing here re-runs until arrange is
 * pressed again.
 *
 * Which arrangement applies to a set of siblings is chosen by the depth of those
 * siblings, through the same cascade shape as style: `teamDepth[d] ?? default`.
 */
import type { Arrangement } from '../files/types'

export interface Sized {
  w: number
  h: number
}

export interface Placed extends Sized {
  rx: number
  ry: number
}

export const GAP = 12

const gridColumns = (a: Arrangement, n: number): number => {
  const m = /^grid-(\d+)x(\d+)$/.exec(a)
  if (m) return Math.max(1, Number(m[1]))
  if (a === 'top-to-bottom') return 1
  return n // left-to-right: one row
}

/**
 * Greedy wrapping is a step function, so SEARCHING the row-width limit lands on
 * local optima — a binary search gave 1.13 at one window size and 2.26 at another
 * for the same target. Enumerating every reachable wrap instead is deterministic:
 * the distinct row widths are the cumulative widths of runs, and any limit between
 * two of them wraps identically.
 */
export function packToAspect<T extends Sized>(kids: T[], target: number): { rows: T[][]; w: number; h: number } {
  const tryLimit = (limit: number): { rows: T[][]; w: number; h: number } => {
    const rows: T[][] = []
    let row: T[] = []
    let rowW = 0
    for (const k of kids) {
      const add = row.length ? GAP + k.w : k.w
      if (row.length && rowW + add > limit) {
        rows.push(row)
        row = [k]
        rowW = k.w
      } else {
        row.push(k)
        rowW += add
      }
    }
    if (row.length) rows.push(row)
    const w = Math.max(...rows.map((r) => r.reduce((a, k) => a + k.w + GAP, -GAP)))
    const h = rows.reduce((a, r) => a + Math.max(...r.map((k) => k.h)) + GAP, -GAP)
    return { rows, w, h }
  }

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

  let best = tryLimit(limits[limits.length - 1] ?? 0)
  let bestErr = Number.POSITIVE_INFINITY
  for (const limit of limits) {
    const r = tryLimit(limit)
    // Log space, so "twice too wide" and "twice too tall" are penalised equally.
    const err = Math.abs(Math.log(r.w / r.h / target))
    if (err < bestErr) {
      bestErr = err
      best = r
    }
  }
  return best
}

/** Lays a set of sized siblings out in rows, returning offsets and the block size. */
export function arrangeSiblings<T extends Sized>(
  kids: T[],
  arrangement: Arrangement,
  targetAspect: number,
): { placed: (T & Placed)[]; w: number; h: number } {
  if (kids.length === 0) return { placed: [], w: 0, h: 0 }

  let rows: T[][]
  if (arrangement === 'fit') {
    rows = packToAspect(kids, targetAspect).rows
  } else {
    const cols = Math.max(1, gridColumns(arrangement, kids.length))
    rows = []
    for (let i = 0; i < kids.length; i += cols) rows.push(kids.slice(i, i + cols))
  }

  const placed: (T & Placed)[] = []
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

export function arrangementFor(
  cascade: { default: Arrangement; teamDepth?: Record<number, Arrangement> },
  childDepth: number,
): Arrangement {
  return cascade.teamDepth?.[childDepth] ?? cascade.default
}
