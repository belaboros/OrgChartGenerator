/**
 * The drawing surface: plain SVG (#19).
 *
 * No rendering library. Pan, zoom and hit-testing are pointer events on the
 * elements themselves. #19 measured this at 60 fps with 505 labels on acme-large,
 * faster to first paint than either library candidate, and with no dependency.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import type { ShapeKind } from '../files/types'
import type { Placement, PlacedTeam, DetailSwitches } from './layout'
import { positionLabel, METRICS } from './layout'
import type { StyleDoc } from './cascade'
import { resolvePositionStyle, resolveTeamStyle } from './cascade'
import type { Box } from './contain'
import { contains, holdsContent } from './contain'
import type { SiblingOverlap } from './drag'
import { siblingClashes } from './drag'

export interface CanvasHandle {
  fit(): void
  zoom(): number
  /** The live <svg>, for export. */
  element(): SVGSVGElement | null
}

interface Props {
  placement: Placement
  style: StyleDoc
  /** Global since #34 — one Shape for the whole View, not a cascade layer. */
  shape: ShapeKind
  detail: DetailSwitches
  selected: string | null
  onSelect(path: string | null): void
  /** Paths carrying hand-placed geometry, so they can be marked as such. */
  manual: ReadonlySet<string>
  onMove(path: string, dx: number, dy: number): void
  /** The full box, because `ellipse` resizes about its centre and so moves x/y (#48). */
  onResize(path: string, box: { x: number; y: number; w: number; h: number }): void
  /** What a drag may do to the Teams beside it — see `drag.ts` for the three answers. */
  siblingOverlap: SiblingOverlap
}

/**
 * A gesture in progress. `exempt` is the siblings this Team already overlapped when
 * the pointer went down, frozen for the life of the gesture — see `siblingClashes`.
 */
type Drag =
  | { kind: 'pan'; sx: number; sy: number }
  | { kind: 'move'; path: string; ox: number; oy: number; dx: number; dy: number; exempt: ReadonlySet<string> }
  | {
      kind: 'resize'
      path: string
      x: number
      y: number
      w: number
      h: number
      box: Box
      exempt: ReadonlySet<string>
    }

interface Transform {
  x: number
  y: number
  k: number
}

/** One empty array, so "nothing clashes" is the same value every time. */
const NONE: readonly string[] = []

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { placement, style, shape, detail, selected, onSelect, manual, onMove, onResize, siblingOverlap },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [t, setT] = useState<Transform>({ x: 20, y: 20, k: 1 })
  const drag = useRef<Drag | null>(null)
  /** Live drag feedback, applied at render; committed to real geometry on release. */
  const [preview, setPreview] = useState<{ paths: Set<string>; dx: number; dy: number } | null>(null)
  const [sizing, setSizing] = useState<{ path: string; x: number; y: number; w: number; h: number } | null>(null)
  /**
   * The boundary currently holding a drag back.
   *
   * The gesture does NOT end at the limit: the shape stops at the boundary while the
   * pointer carries on, and picks the shape back up the moment the pointer returns to
   * somewhere legal. So this is live state for as long as the drag is pressed against
   * something, not a mark left behind by a stop.
   */
  const [blockedBy, setBlockedBy] = useState<string | null>(null)
  /**
   * Siblings the dragged Team is sitting on top of right now, under
   * `only-during-drag` — where the overlap is allowed but will not survive release.
   * Marking them is what keeps the snap-back from arriving as a surprise.
   */
  const [clashing, setClashing] = useState<readonly string[]>(NONE)
  /**
   * The Team a release just sent back where it came from. The snap-back itself is
   * instantaneous and therefore invisible; this says which shape moved and why, and
   * clears itself shortly after.
   */
  const [reverted, setReverted] = useState<{ path: string; at: number } | null>(null)
  useEffect(() => {
    if (!reverted) return
    const id = setTimeout(() => setReverted(null), 1600)
    return () => clearTimeout(id)
  }, [reverted])

  const toWorld = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = svgRef.current?.getBoundingClientRect()
      if (!r) return { x: 0, y: 0 }
      return { x: (e.clientX - r.left - t.x) / t.k, y: (e.clientY - r.top - t.y) / t.k }
    },
    [t],
  )

  const fit = useCallback(() => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const k = Math.min(r.width / placement.width, r.height / placement.height) * 0.96
    setT({ k, x: (r.width - placement.width * k) / 2, y: (r.height - placement.height * k) / 2 })
  }, [placement.width, placement.height])

  useImperativeHandle(ref, () => ({ fit, zoom: () => t.k, element: () => svgRef.current }), [fit, t.k])

  // Fit whenever the diagram changes shape. Dead canvas makes everything look
  // worse than it is, and filling the window is the point (#22).
  useEffect(() => {
    const id = requestAnimationFrame(fit)
    return () => cancelAnimationFrame(id)
  }, [fit])

  const nodeOf = useCallback(
    (path: string): PlacedTeam | undefined => placement.nodes.find((n) => n.path === path),
    [placement],
  )

  /**
   * What stops this box, as the path of the shape doing the stopping — `null` when
   * nothing does. Naming the obstacle rather than returning a bare `false` is what
   * lets the canvas mark the thing the drag is pressed against, which under the
   * sibling policy is no longer always the parent.
   *
   * Nesting protection (#46): a move is legal when the dragged Team is still inside
   * its parent's Shape — the subtree translates rigidly, so only the dragged Team
   * need be tested. A resize must also still hold its own children and labels, and
   * there the obstacle is the Team's own contents, so it names itself.
   *
   * The organization has no parent, so nothing contains it.
   */
  const blocker = useCallback(
    (path: string, box: Box, checkContent: boolean, exempt: ReadonlySet<string>): string | null => {
      const n = nodeOf(path)
      if (!n) return path
      const parent = n.parentPath ? nodeOf(n.parentPath) : undefined
      if (parent && !contains(parent, shape, box)) return parent.path
      if (checkContent) {
        const kids = placement.nodes.filter((m) => m.parentPath === path)
        if (!holdsContent(box, shape, kids, n, detail)) return path
      }
      // A sibling is a wall under `not-enabled` only. The other two policies let the
      // pointer through and differ in what RELEASE does about the overlap.
      if (siblingOverlap === 'not-enabled') {
        return siblingClashes(placement.nodes, path, box, shape, exempt)[0] ?? null
      }
      return null
    },
    [nodeOf, placement, shape, detail, siblingOverlap],
  )

  /**
   * The siblings this box lands on, under the one policy that has anything to say
   * about them at release: empty for the other two, which is what makes the check on
   * pointer-up a no-op there rather than a special case. Never stops a drag.
   */
  const clashesAt = useCallback(
    (path: string, box: Box, exempt: ReadonlySet<string>): readonly string[] =>
      siblingOverlap === 'only-during-drag' ? siblingClashes(placement.nodes, path, box, shape, exempt) : NONE,
    [placement, shape, siblingOverlap],
  )

  /** The siblings a Team already sits on, frozen when a gesture starts. */
  const exemptAt = useCallback(
    (n: PlacedTeam): ReadonlySet<string> =>
      new Set(siblingClashes(placement.nodes, n.path, { x: n.x, y: n.y, w: n.w, h: n.h }, shape)),
    [placement, shape],
  )

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = e.clientX - r.left
    const py = e.clientY - r.top
    setT((p) => {
      const k = Math.max(0.02, Math.min(6, p.k * (e.deltaY > 0 ? 0.93 : 1.07)))
      return { k, x: px - ((px - p.x) / p.k) * k, y: py - ((py - p.y) / p.k) * k }
    })
  }, [])

  return (
    <svg
      ref={svgRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff', touchAction: 'none' }}
      onWheel={onWheel}
      onPointerDown={(e) => {
        // Empty canvas pans. A shape handles its own pointer-down and stops it,
        // so the two gestures never compete — see altKey below for the escape
        // hatch when the diagram is too dense to find empty canvas.
        if (e.target !== svgRef.current) return
        onSelect(null)
        drag.current = { kind: 'pan', sx: e.clientX - t.x, sy: e.clientY - t.y }
        svgRef.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        if (d.kind === 'pan') {
          setT((prev) => ({ ...prev, x: e.clientX - d.sx, y: e.clientY - d.sy }))
          return
        }
        const world = toWorld(e)
        const n = nodeOf(d.path)
        if (!n) return

        /*
         * Clamped, not cancelled. Each axis is tried on its own after the pair fails,
         * so a drag into a corner SLIDES along the wall instead of sticking: without
         * that, pushing diagonally against an edge freezes the shape completely and
         * the protection feels like a seized control rather than a wall.
         *
         * Nothing here ends the gesture. The pointer may leave the parent entirely and
         * the shape simply waits at the boundary; bring it back and the shape follows
         * again from wherever the pointer now is.
         */
        if (d.kind === 'move') {
          const dx = world.x - d.ox
          const dy = world.y - d.oy
          const boxAt = (ax: number, ay: number): Box => ({ x: n.x + ax, y: n.y + ay, w: n.w, h: n.h })
          const stops = (ax: number, ay: number): string | null =>
            blocker(d.path, boxAt(ax, ay), false, d.exempt)

          let nx = d.dx
          let ny = d.dy
          const hit = stops(dx, dy)
          if (!hit) {
            nx = dx
            ny = dy
          } else if (!stops(dx, d.dy)) {
            nx = dx
          } else if (!stops(d.dx, dy)) {
            ny = dy
          }

          d.dx = nx
          d.dy = ny
          setBlockedBy(nx !== dx || ny !== dy ? hit : null)
          setClashing(clashesAt(d.path, boxAt(nx, ny), d.exempt))
          setPreview({ paths: subtreeOf(placement, d.path), dx: nx, dy: ny })
        } else {
          // `ellipse` grows about its centre (#48); `rectangle` from its fixed corner.
          const w = Math.max(20, world.x - d.x)
          const h = Math.max(20, world.y - d.y)
          const boxFor = (bw: number, bh: number): Box =>
            shape === 'ellipse'
              ? { x: n.x + (n.w - bw) / 2, y: n.y + (n.h - bh) / 2, w: bw, h: bh }
              : { x: d.x, y: d.y, w: bw, h: bh }
          const stops = (bw: number, bh: number): string | null =>
            blocker(d.path, boxFor(bw, bh), true, d.exempt)

          let nw = d.w
          let nh = d.h
          const hit = stops(w, h)
          if (!hit) {
            nw = w
            nh = h
          } else if (!stops(w, d.h)) {
            nw = w
          } else if (!stops(d.w, h)) {
            nh = h
          }

          d.w = nw
          d.h = nh
          d.box = boxFor(nw, nh)
          setBlockedBy(nw !== w || nh !== h ? hit : null)
          setClashing(clashesAt(d.path, d.box, d.exempt))
          setSizing({ path: d.path, ...d.box })
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        setPreview(null)
        setSizing(null)
        setBlockedBy(null)
        setClashing(NONE)
        if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
        if (!d || d.kind === 'pan') return
        const n = nodeOf(d.path)
        if (!n) return

        /*
         * `only-during-drag` refuses at RELEASE, and refuses the gesture WHOLE: the
         * Team keeps the position and size it had when the pointer went down. The
         * alternative — committing as far along as was clash-free — would leave it
         * somewhere neither the user nor Arrange ever chose, which is the outcome
         * this policy exists to avoid.
         */
        const landed = d.kind === 'move' ? { x: n.x + d.dx, y: n.y + d.dy, w: n.w, h: n.h } : d.box
        if (clashesAt(d.path, landed, d.exempt).length > 0) {
          setReverted({ path: d.path, at: Date.now() })
          return
        }

        if (d.kind === 'move') {
          if (d.dx !== 0 || d.dy !== 0) onMove(d.path, d.dx, d.dy)
        } else {
          onResize(d.path, d.box)
        }
      }}
    >
      <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
        {placement.nodes.map((n) =>
          n.parentPath === null ? null : (
            <Edge key={`e:${n.path}`} node={n} nodes={placement.nodes} />
          ),
        )}
        {placement.nodes.map((n) => {
          const moved = preview?.paths.has(n.path) ? preview : null
          const resized = sizing?.path === n.path ? sizing : null
          return (
            <TeamShape
              key={n.path}
              node={
                moved || resized
                  ? {
                      ...n,
                      x: resized ? resized.x : n.x + (moved?.dx ?? 0),
                      y: resized ? resized.y : n.y + (moved?.dy ?? 0),
                      w: resized?.w ?? n.w,
                      h: resized?.h ?? n.h,
                    }
                  : n
              }
              style={style}
              shape={shape}
              detail={detail}
              selected={selected === n.path}
              hand={manual.has(n.path)}
              onSelect={onSelect}
              onStartMove={(path, e) => {
                if (e.altKey) return // alt-drag pans, even over a shape
                const w = toWorld(e)
                drag.current = { kind: 'move', path, ox: w.x, oy: w.y, dx: 0, dy: 0, exempt: exemptAt(n) }
                svgRef.current?.setPointerCapture(e.pointerId)
              }}
              onStartResize={(path, e) => {
                drag.current = {
                  kind: 'resize',
                  path,
                  x: n.x,
                  y: n.y,
                  w: n.w,
                  h: n.h,
                  box: { x: n.x, y: n.y, w: n.w, h: n.h },
                  exempt: exemptAt(n),
                }
                svgRef.current?.setPointerCapture(e.pointerId)
              }}
            />
          )
        })}
        {/*
          The boundary currently holding the drag back. Shown only while the shape
          is actually pressed against it, so it reads as a wall rather than as the
          drag having died. Under `not-enabled` the wall can be a SIBLING, which is
          why this traces whatever `blocker` named rather than always the parent.
        */}
        {blockedBy &&
          (() => {
            const p = placement.nodes.find((n) => n.path === blockedBy)
            return p ? <Outline box={p} shape={shape} colour="#c0392b" mark="stopped" /> : null
          })()}
        {/*
          Siblings the Team is currently on top of, under `only-during-drag`. The
          overlap is legal right now and will not survive release, and a mark is the
          only warning there is — otherwise the snap-back looks like a lost drag.
        */}
        {clashing.map((path) => {
          const p = placement.nodes.find((n) => n.path === path)
          return p ? <Outline key={`c:${path}`} box={p} shape={shape} colour="#a3600a" dashed mark="clash" /> : null
        })}
        {/* Where the Team went back to, and the only sign it went anywhere at all. */}
        {reverted &&
          (() => {
            const p = placement.nodes.find((n) => n.path === reverted.path)
            return p ? <Outline box={p} shape={shape} colour="#a3600a" mark="reverted" /> : null
          })()}
      </g>
    </svg>
  )
})

/** One shape traced where it stands — how the canvas points at something. */
function Outline({
  box,
  shape,
  colour,
  dashed,
  mark,
}: {
  box: Box
  shape: ShapeKind
  colour: string
  dashed?: boolean
  mark: string
}) {
  const common = {
    fill: 'none',
    stroke: colour,
    strokeWidth: 3,
    pointerEvents: 'none' as const,
    'data-export-hide': '',
    'data-k': mark,
    ...(dashed ? { strokeDasharray: '7 4' } : {}),
  }
  return shape === 'ellipse' ? (
    <ellipse cx={box.x + box.w / 2} cy={box.y + box.h / 2} rx={box.w / 2} ry={box.h / 2} {...common} />
  ) : (
    <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={4} {...common} />
  )
}

/** Containment edges. Only drawn for `tree`; in `nested` a parent already contains its children. */
function Edge({ node, nodes }: { node: PlacedTeam; nodes: PlacedTeam[] }) {
  const parent = nodes.find((m) => m.path === node.parentPath)
  if (!parent) return null
  // Inside a containing parent an edge would be noise, so skip it.
  const inside =
    node.x >= parent.x && node.y >= parent.y &&
    node.x + node.w <= parent.x + parent.w && node.y + node.h <= parent.y + parent.h
  if (inside) return null
  return (
    <line
      x1={parent.x + parent.w}
      y1={parent.y + parent.h / 2}
      x2={node.x}
      y2={node.y + node.h / 2}
      stroke="#c3c7cc"
      strokeWidth={1}
    />
  )
}

/** Every path at or beneath `path` — moving a Team moves its whole subtree. */
function subtreeOf(placement: Placement, path: string): Set<string> {
  return new Set(
    placement.nodes.filter((n) => n.path === path || n.path.startsWith(path + '/')).map((n) => n.path),
  )
}

function TeamShape({
  node,
  style,
  shape,
  detail,
  selected,
  hand,
  onSelect,
  onStartMove,
  onStartResize,
}: {
  node: PlacedTeam
  style: StyleDoc
  shape: ShapeKind
  detail: DetailSwitches
  selected: boolean
  hand: boolean
  onSelect(path: string): void
  onStartMove(path: string, e: React.PointerEvent): void
  onStartResize(path: string, e: React.PointerEvent): void
}) {
  const s = resolveTeamStyle(style, node.depth, node.path)
  const ellipse = shape === 'ellipse'
  const top = (ellipse ? (node.labelTop ?? 0) + 4 : 0) + METRICS.HEADER + (detail.counts ? METRICS.LINE : 0)
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onPointerDown={(e) => {
        // Children render after parents, so the deepest shape under the cursor
        // receives this first — which is the one the user meant.
        if (e.altKey) return // let it reach the canvas, which pans
        e.stopPropagation()
        onSelect(node.path)
        onStartMove(node.path, e)
      }}
    >
      {shape === 'ellipse' ? (
        <ellipse
          cx={node.w / 2}
          cy={node.h / 2}
          rx={node.w / 2}
          ry={node.h / 2}
          fill={s.fill}
          stroke={s.line}
          strokeWidth={s.border}
        />
      ) : (
        <rect width={node.w} height={node.h} rx={4} fill={s.fill} stroke={s.line} strokeWidth={s.border} />
      )}
      {/*
        Inside an ellipse the top-left corner is outside the shape, so the label
        goes on the centre line at the band the packer reserved for it (#41).
      */}
      <text
        x={ellipse ? node.w / 2 : s.margin}
        y={(ellipse ? (node.labelTop ?? 0) + 4 : 6) + s.font}
        textAnchor={ellipse ? 'middle' : 'start'}
        fontSize={s.font}
        fontWeight={600}
        fill={s.text}
      >
        {node.name}
      </text>
      {detail.counts && (
        <text
          x={ellipse ? node.w / 2 : s.margin}
          y={(ellipse ? (node.labelTop ?? 0) + 4 : 6) + s.font + 13}
          textAnchor={ellipse ? 'middle' : 'start'}
          fontSize={10}
          fill="#70757a"
        >
          {node.positionCount} positions · {node.vacantCount} vacant
        </text>
      )}
      {node.positions.map((p, i) => {
        const ps = resolvePositionStyle(style, p)
        const y = top + i * METRICS.LINE
        return (
          <g key={i}>
            {ps.fill !== 'transparent' && !ellipse && (
              <rect x={6} y={y - 1} width={node.w - 12} height={METRICS.LINE} fill={ps.fill} />
            )}
            <text
              x={ellipse ? node.w / 2 : s.margin + 2}
              y={y + ps.font}
              textAnchor={ellipse ? 'middle' : 'start'}
              fontSize={ps.font}
              fill={ps.text}
            >
              {positionLabel(p, detail)}
            </text>
          </g>
        )
      })}
      {hand && (
        <rect data-export-hide="" x={0} y={0} width={6} height={6} fill="#a3600a" pointerEvents="none">
          <title>hand-placed — Arrange will discard this</title>
        </rect>
      )}
      {selected && (
        <rect
          className="resize-handle"
          data-export-hide=""
          x={node.w - 9}
          y={node.h - 9}
          width={11}
          height={11}
          rx={2}
          fill="#1a4fb0"
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => {
            e.stopPropagation()
            onStartResize(node.path, e)
          }}
        />
      )}
      {selected && (
        <rect
          data-export-hide=""
          x={-3}
          y={-3}
          width={node.w + 6}
          height={node.h + 6}
          rx={6}
          fill="none"
          stroke="#1a4fb0"
          strokeWidth={2}
          strokeDasharray="6 3"
          pointerEvents="none"
        />
      )}
    </g>
  )
}
