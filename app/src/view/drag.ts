/**
 * The sibling-overlap policy: what a hand drag may do to the Teams beside it.
 *
 * Nesting protection (#45, #46) answered one question — a Team may not leave its
 * parent — and left the other open: nothing stopped two Teams with the SAME parent
 * from being dragged on top of each other, which Arrange never does and which no
 * saved view had any way to express as deliberate.
 *
 * Three answers ship, because the honest one differs by what the user is doing:
 *
 *   `enabled`           overlap is allowed and kept. Two Teams may be stacked on
 *                       purpose — which is the only way to draw some things.
 *   `only-during-drag`  overlap is allowed WHILE the pointer is down and refused at
 *                       release: a clashing gesture is discarded whole and the Team
 *                       returns to the position and size it had before. The default,
 *                       because it lets a drag pass OVER a sibling to reach free
 *                       space, and reaching free space is the common case.
 *   `not-enabled`       overlap never happens: the drag clamps at the sibling the way
 *                       it already clamps at the parent, and the gesture carries on.
 *
 * This is an interaction policy, not part of the picture, so it is NOT written to the
 * view file: a View is a visual representation, and two people opening the same View
 * may want different amounts of help while editing it.
 */
import type { ShapeKind } from '../files/types'
import type { Box } from './contain'
import { overlaps } from './contain'

export type SiblingOverlap = 'enabled' | 'only-during-drag' | 'not-enabled'

export const SIBLING_OVERLAPS = ['enabled', 'only-during-drag', 'not-enabled'] as const satisfies readonly SiblingOverlap[]

/** Permissive enough to drag across a sibling, strict enough to not leave a mess. */
export const DEFAULT_SIBLING_OVERLAP: SiblingOverlap = 'only-during-drag'

export const SIBLING_OVERLAP_LABEL: Record<SiblingOverlap, string> = {
  enabled: 'enabled',
  'only-during-drag': 'only during drag',
  'not-enabled': 'not enabled',
}

export const SIBLING_OVERLAP_HINT: Record<SiblingOverlap, string> = {
  enabled: 'Teams sharing a parent may be moved and resized over each other, and stay where they are put.',
  'only-during-drag':
    'A Team may pass over its siblings while the pointer is down. If it still overlaps one when released, the whole move or resize is discarded and the Team snaps back.',
  'not-enabled':
    'A move or resize stops at the first sibling it would touch, the way it already stops at the parent. The gesture stays live — slide along the shape and it follows again.',
}

interface Node extends Box {
  path: string
  parentPath: string | null
}

/** The Teams drawn beside this one: same parent, itself excluded. */
export function siblingsOf<T extends { path: string; parentPath: string | null }>(
  nodes: readonly T[],
  path: string,
): T[] {
  const self = nodes.find((n) => n.path === path)
  if (!self) return []
  return nodes.filter((n) => n.path !== path && n.parentPath === self.parentPath)
}

/**
 * Which siblings `box` would overlap if the Team at `path` were drawn there.
 *
 * Only the dragged Team is tested, never its descendants: a move translates the whole
 * subtree rigidly inside a box that is itself being kept inside its parent, so a
 * descendant can only clash if its own parent does.
 *
 * `exempt` is the set of siblings this Team ALREADY overlapped when the gesture began,
 * and they are ignored for the rest of it. Without that, a Team that arrives overlapping
 * — a view saved under `enabled`, or the policy tightened afterwards — is frozen: every
 * candidate box clashes, so the Team can be neither separated nor even nudged, and the
 * protection reads as a seized control rather than as a wall.
 */
export function siblingClashes(
  nodes: readonly Node[],
  path: string,
  box: Box,
  shape: ShapeKind,
  exempt: ReadonlySet<string> = new Set(),
): string[] {
  return siblingsOf(nodes, path)
    .filter((s) => !exempt.has(s.path) && overlaps(box, s, shape))
    .map((s) => s.path)
}

/** Every pair of siblings drawn on top of each other. Arrange's output has none. */
export function overlappingSiblings(nodes: readonly Node[], shape: ShapeKind): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!
      const b = nodes[j]!
      if (a.parentPath === b.parentPath && overlaps(a, b, shape)) out.push([a.path, b.path])
    }
  }
  return out
}
