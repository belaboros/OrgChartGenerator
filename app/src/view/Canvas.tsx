/**
 * The drawing surface: plain SVG (#19).
 *
 * No rendering library. Pan, zoom and hit-testing are pointer events on the
 * elements themselves. #19 measured this at 60 fps with 505 labels on acme-large,
 * faster to first paint than either library candidate, and with no dependency.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import type { Placement, PlacedTeam, DetailSwitches } from './layout'
import { positionLabel, METRICS } from './layout'
import type { StyleDoc } from './cascade'
import { resolvePositionStyle, resolveTeamStyle } from './cascade'

export interface CanvasHandle {
  fit(): void
  zoom(): number
  /** The live <svg>, for export. */
  element(): SVGSVGElement | null
}

interface Props {
  placement: Placement
  style: StyleDoc
  detail: DetailSwitches
  selected: string | null
  onSelect(path: string | null): void
  /** Paths carrying hand-placed geometry, so they can be marked as such. */
  manual: ReadonlySet<string>
  onMove(path: string, dx: number, dy: number): void
  onResize(path: string, w: number, h: number): void
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number }
  | { kind: 'move'; path: string; ox: number; oy: number; dx: number; dy: number }
  | { kind: 'resize'; path: string; x: number; y: number; w: number; h: number }

interface Transform {
  x: number
  y: number
  k: number
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { placement, style, detail, selected, onSelect, manual, onMove, onResize },
  ref,
) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [t, setT] = useState<Transform>({ x: 20, y: 20, k: 1 })
  const drag = useRef<Drag | null>(null)
  /** Live drag feedback, applied at render; committed to real geometry on release. */
  const [preview, setPreview] = useState<{ paths: Set<string>; dx: number; dy: number } | null>(null)
  const [sizing, setSizing] = useState<{ path: string; w: number; h: number } | null>(null)

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
        if (d.kind === 'move') {
          const dx = world.x - d.ox
          const dy = world.y - d.oy
          d.dx = dx
          d.dy = dy
          setPreview({ paths: subtreeOf(placement, d.path), dx, dy })
        } else {
          const w = Math.max(60, world.x - d.x)
          const h = Math.max(34, world.y - d.y)
          d.w = w
          d.h = h
          setSizing({ path: d.path, w, h })
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        setPreview(null)
        setSizing(null)
        if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId)
        if (!d || d.kind === 'pan') return
        if (d.kind === 'move') {
          if (d.dx !== 0 || d.dy !== 0) onMove(d.path, d.dx, d.dy)
        } else {
          onResize(d.path, d.w, d.h)
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
                      x: n.x + (moved?.dx ?? 0),
                      y: n.y + (moved?.dy ?? 0),
                      w: resized?.w ?? n.w,
                      h: resized?.h ?? n.h,
                    }
                  : n
              }
              style={style}
              detail={detail}
              selected={selected === n.path}
              hand={manual.has(n.path)}
              onSelect={onSelect}
              onStartMove={(path, e) => {
                if (e.altKey) return // alt-drag pans, even over a shape
                const w = toWorld(e)
                drag.current = { kind: 'move', path, ox: w.x, oy: w.y, dx: 0, dy: 0 }
                svgRef.current?.setPointerCapture(e.pointerId)
              }}
              onStartResize={(path, e) => {
                drag.current = { kind: 'resize', path, x: n.x, y: n.y, w: n.w, h: n.h }
                svgRef.current?.setPointerCapture(e.pointerId)
              }}
            />
          )
        })}
      </g>
    </svg>
  )
})

/** Containment edges. Only drawn for node-link; in enclosure a parent encloses its children. */
function Edge({ node, nodes }: { node: PlacedTeam; nodes: PlacedTeam[] }) {
  const parent = nodes.find((m) => m.path === node.parentPath)
  if (!parent) return null
  // Inside an enclosing parent an edge would be noise, so skip it.
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
  detail,
  selected,
  hand,
  onSelect,
  onStartMove,
  onStartResize,
}: {
  node: PlacedTeam
  style: StyleDoc
  detail: DetailSwitches
  selected: boolean
  hand: boolean
  onSelect(path: string): void
  onStartMove(path: string, e: React.PointerEvent): void
  onStartResize(path: string, e: React.PointerEvent): void
}) {
  const s = resolveTeamStyle(style, node.depth, node.path)
  const top = METRICS.HEADER + (detail.counts ? METRICS.LINE : 0)
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
      {s.shape === 'circle' ? (
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
      <text x={s.margin} y={6 + s.font} fontSize={s.font} fontWeight={600} fill={s.text}>
        {node.name}
      </text>
      {detail.counts && (
        <text x={s.margin} y={6 + s.font + 13} fontSize={10} fill="#70757a">
          {node.positionCount} positions · {node.vacantCount} vacant
        </text>
      )}
      {node.positions.map((p, i) => {
        const ps = resolvePositionStyle(style, p)
        const y = top + i * METRICS.LINE
        return (
          <g key={i}>
            {ps.fill !== 'transparent' && (
              <rect x={6} y={y - 1} width={node.w - 12} height={METRICS.LINE} fill={ps.fill} />
            )}
            <text x={s.margin + 2} y={y + ps.font} fontSize={ps.font} fill={ps.text}>
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
