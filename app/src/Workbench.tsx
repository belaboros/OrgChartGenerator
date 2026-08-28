import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import yaml from 'js-yaml'
import type { ArrangementDoc } from './files/types'
import type { Organization } from './model/types'
import type { Files } from './files/types'
import { layout } from './view/layout'
import type { DetailSwitches } from './view/layout'
import { Canvas } from './view/Canvas'
import { ArrangePanel } from './ui/ArrangePanel'
import { Inspector } from './ui/Inspector'
import { renderSvgToPng, ExportTooLarge } from './view/png'
import { DEFAULT_ARRANGEMENT, parseViewDoc, serialise, toViewDoc, viewFileName, viewNameOf, ViewFileError } from './view/viewFile'
import type { CanvasHandle } from './view/Canvas'
import { DEFAULT_STYLE, writeLayer } from './view/cascade'
import type { StyleDoc } from './view/cascade'
import { useFps } from './useFps'

/**
 * #25 renders. The control surface is the Inspector rail chosen in #22 and built
 * in #27; detail switches and the Role filter are #27 too. What is here is the
 * minimum needed to show both arrangements, both shapes, and the cascade working.
 */
export function Workbench({ org, files, onClose }: { org: Organization; files: Files; onClose(): void }) {
  /**
   * The arrangement, twice over (#36).
   *
   * `arrangement` is what the diagram was actually arranged under; `draft` is what
   * the panel is showing. Nothing on the panel touches the diagram until Arrange
   * copies one into the other, which is what makes browsing the other tab free.
   *
   * The file format already works this way: `geometry` is authoritative for what
   * is drawn, and `arrangement` records what arrange would apply NEXT — so a saved
   * view stores the DRAFT, and re-opening it puts you back exactly where you were.
   */
  const [arrangement, setArrangement] = useState<ArrangementDoc>(DEFAULT_ARRANGEMENT)
  const [draft, setDraft] = useState<ArrangementDoc>(DEFAULT_ARRANGEMENT)
  /**
   * The window, twice over (#35).
   *
   * `live` is tracked in a ref precisely so that resizing does NOT re-render and
   * therefore does not re-wrap; `windowAt` is the snapshot layout actually uses,
   * refreshed only when the arrange command runs. That is what "frozen at arrange
   * time" means in practice — resizing rescales the diagram, it never re-breaks it.
   */
  const live = useRef({ w: 1200, h: 750 })
  const [windowAt, setWindowAt] = useState({ w: 1200, h: 750 })
  /**
   * Geometry the user has placed by hand. Empty here — #28 fills it. It exists now
   * because arrange's contract is defined against it: pressing arrange DISCARDS
   * these, so anything that recomputes layout has to go through the same door.
   */
  const [manual, setManual] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<StyleDoc>(DEFAULT_STYLE)
  const [selected, setSelected] = useState<string | null>(null)
  const [interacting, setInteracting] = useState(false)
  const canvas = useRef<CanvasHandle>(null)
  const { fps, worst } = useFps(interacting)

  const [detail, setDetail] = useState<DetailSwitches>({ positions: true, occupantNames: true, counts: false })
  const [filter, setFilter] = useState<ReadonlySet<string>>(new Set())
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [arrangeCollapsed, setArrangeCollapsed] = useState(false)
  const [exportNote, setExportNote] = useState('')
  const [exporting, setExporting] = useState(false)
  const [views, setViews] = useState<string[]>([])
  const [viewNote, setViewNote] = useState('')

  const { placement, layoutMs } = useMemo(() => {
    const t0 = performance.now()
    const p = layout(org, { arrangement, detail, roleFilter: filter, window: windowAt })
    return { placement: p, layoutMs: performance.now() - t0 }
  }, [org, arrangement, windowAt, detail, filter])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = (): void => {
      live.current = { w: Math.max(1, el.clientWidth), h: Math.max(1, el.clientHeight) }
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    measure()
    // The first real measurement is the snapshot the first arrange works from.
    setWindowAt(live.current)
    return () => ro.disconnect()
  }, [])

  const manualCount = Object.keys(manual).length

  /** Names the option actually in force, for the exported file name. */
  const activeOption =
    arrangement.active === 'tree' ? arrangement.tree.direction : arrangement.nested.wrap

  /**
   * Arrange is a command. Anything that recomputes the whole layout — pressing the
   * button, switching arrangement, changing any of its options — is the same command, and
   * therefore discards hand-placed geometry. Routing all of them through one door
   * is what stops a dropdown from quietly destroying work a button warns about.
   */
  const arrange = useCallback(
    (change?: () => void): void => {
      if (manualCount > 0) {
        const ok = window.confirm(
          `Arrange recomputes every shape and discards ${manualCount} hand-placed ` +
            `position${manualCount === 1 ? '' : 's'}. Continue?`,
        )
        if (!ok) return
      }
      setManual({})
      // Arrange is where the window is read. Nothing else re-reads it (#35).
      setWindowAt(live.current)
      setArrangement(draft)
      change?.()
    },
    [manualCount, draft],
  )

  /*
   * The line between what discards hand-placed geometry and what does not is drawn
   * at WHAT THE CONTROL IS ABOUT, not at whether it happens to change box sizes.
   *
   *   Placement controls — the arrangement, its options, the Arrange button — exist to
   *   decide where shapes go, so keeping hand placement through them is meaningless.
   *   They discard, and confirm first.
   *
   *   Content controls — detail switches, the Role filter, styling — do not ask for
   *   a new placement. Hand-placed shapes keep the position and size they were
   *   given; only their contents change.
   *
   * (This revises #27, which routed detail and filter through arrange(). #28's
   * done-condition is the better rule and this is the line that satisfies it.)
   */
  const toggleDetail = useCallback(
    (k: keyof DetailSwitches) => setDetail((d) => ({ ...d, [k]: !d[k] })),
    [],
  )
  const changeFilter = useCallback((next: Set<string>) => setFilter(next), [])
  const manualPaths = useMemo(() => new Set(Object.keys(manual)), [manual])

  /** Moving a Team moves its whole subtree — a child cannot leave its parent. */
  const onMove = useCallback(
    (path: string, dx: number, dy: number) => {
      setManual((prev) => {
        const next = { ...prev }
        for (const n of placement.nodes) {
          if (n.path !== path && !n.path.startsWith(path + '/')) continue
          const cur = next[n.path] ?? { x: n.x, y: n.y, w: n.w, h: n.h }
          next[n.path] = { ...cur, x: cur.x + dx, y: cur.y + dy }
        }
        return next
      })
    },
    [placement],
  )

  /** Resizing affects only the Team resized; its children keep their own geometry. */
  const onResize = useCallback(
    (path: string, w: number, h: number) => {
      setManual((prev) => {
        const n = placement.nodes.find((m) => m.path === path)
        if (!n) return prev
        const cur = prev[path] ?? { x: n.x, y: n.y, w: n.w, h: n.h }
        return { ...prev, [path]: { ...cur, w, h } }
      })
    },
    [placement],
  )

  useEffect(() => {
    void files.listViews(org.prefix).then(setViews)
  }, [files, org.prefix])

  const loadView = useCallback(
    async (file: string) => {
      try {
        const doc = parseViewDoc(await files.loadView(file))
        // The binding to the organization is recorded, not enforced (#6 Q7, #18).
        const mismatch = doc.org !== org.name ? ` (saved against "${doc.org}", not "${org.name}")` : ''
        setArrangement(doc.arrangement)
        setDraft(doc.arrangement)
        setDetail(doc.detail)
        setFilter(new Set(doc.filter?.roles ?? []))
        setStyle(doc.style)
        setManual(doc.geometry)
        setSelected(null)
        setViewNote(`Loaded ${viewNameOf(org.prefix, file)}${mismatch}`)
      } catch (e) {
        setViewNote(
          e instanceof ViewFileError ? `${file} is not a valid view — ${e.message}` :
          `Could not open ${file}: ${e instanceof Error ? e.message : String(e)}`,
        )
      }
    },
    [files, org.name, org.prefix],
  )

  const patchLayer = useCallback(
    (id: string, patch: Record<string, unknown>) => setStyle((prev) => writeLayer(prev, id, patch)),
    [],
  )

  const depths = useMemo(
    () => [...new Set(placement.nodes.map((n) => n.depth))].filter((d) => d > 0).sort((a, b) => a - b),
    [placement],
  )

  /**
   * Shape is global since #34 and lives on the arrangement, not the style cascade —
   * arrange has to read it, so a per-layer override would pack as one shape and
   * draw as another. Changing it re-arranges, like any other arrangement option.
   */
  const shape = arrangement.shape

  const placementWithManual = useMemo(() => {
    if (manualCount === 0) return placement
    const nodes = placement.nodes.map((n) => (manual[n.path] ? { ...n, ...manual[n.path]! } : n))
    return {
      nodes,
      width: Math.max(...nodes.map((n) => n.x + n.w)) + 20,
      height: Math.max(...nodes.map((n) => n.y + n.h)) + 20,
    }
  }, [placement, manual, manualCount])

  // Handles for headless verification; harmless in production.
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w['__placement'] = placementWithManual
    w['__serialiseView'] = (): string => {
      const geometry: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const n of placementWithManual.nodes) geometry[n.path] = { x: n.x, y: n.y, w: n.w, h: n.h }
      return serialise(toViewDoc(org.name, { arrangement: draft, detail, filter, style, geometry }))
    }
    w['__loadViewText'] = (text: string): string => {
      try {
        const doc = parseViewDoc(yaml.load(text))
        setArrangement(doc.arrangement)
        setDraft(doc.arrangement)
        setDetail(doc.detail)
        setFilter(new Set(doc.filter?.roles ?? []))
        setStyle(doc.style)
        setManual(doc.geometry)
        return 'ok'
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    }
  }, [placementWithManual, org.name, draft, detail, filter, style])

  /**
   * Export goes through the file seam, not a bare download link — and it reports
   * the dimensions it actually produced, because silent truncation is the specific
   * defect this feature exists to avoid (#19 measured `toDataURL` returning an
   * empty `data:,` past the canvas cap, with no error at all).
   */
  const exportPng = useCallback(
    async (scale: number) => {
      const svg = canvas.current?.element()
      if (!svg) return
      setExporting(true)
      setExportNote(`Rendering at ${scale}×…`)
      const started = performance.now()
      try {
        const r = await renderSvgToPng(svg, placementWithManual.width, placementWithManual.height, scale)
        await files.exportPng(r.blob, `${org.prefix}-${arrangement.active}-${activeOption}@${scale}x.png`)
        setExportNote(
          `Exported ${r.width}×${r.height} from ${r.tiles} tile${r.tiles === 1 ? '' : 's'}, ` +
            `${(r.blob.size / 1e6).toFixed(1)} MB, ${Math.round(performance.now() - started)} ms`,
        )
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setExportNote('')
        } else {
          setExportNote(
            e instanceof ExportTooLarge || e instanceof Error
              ? `Export failed: ${e.message}`
              : 'Export failed.',
          )
        }
      } finally {
        setExporting(false)
      }
    },
    [files, org.prefix, arrangement, activeOption, placementWithManual],
  )

  /**
   * Geometry is authoritative — it is what gets drawn. `arrangement` only records
   * what the arrange command would apply NEXT, which is why a view saved under
   * `fit` in one window still opens as it was saved in another (#18).
   */
  const saveView = useCallback(
    async (name: string) => {
      const geometry: Record<string, { x: number; y: number; w: number; h: number }> = {}
      for (const n of placementWithManual.nodes) geometry[n.path] = { x: n.x, y: n.y, w: n.w, h: n.h }
      const doc = toViewDoc(org.name, { arrangement: draft, detail, filter, style, geometry })
      const file = viewFileName(org.prefix, name)
      try {
        await files.saveView(file, doc)
        setViews(await files.listViews(org.prefix))
        setViewNote(`Saved ${file} — ${Object.keys(geometry).length} shapes`)
      } catch (e) {
        setViewNote(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [files, org.name, org.prefix, draft, detail, filter, style, placementWithManual],
  )

  /**
   * How many settings would change the PICTURE if Arrange were pressed. Edits to
   * the tab that is not active are still carried in the draft and still saved —
   * they just would not move anything, so counting them would overstate.
   */
  const pending = useMemo(() => {
    let n = 0
    if (draft.active !== arrangement.active) n++
    if (draft.shape !== arrangement.shape) n++
    if (draft.active === 'tree') {
      if (draft.tree.direction !== arrangement.tree.direction) n++
      if (draft.tree.direction !== 'radial' && draft.tree.packSubtrees !== arrangement.tree.packSubtrees) n++
    } else {
      if (draft.nested.wrap !== arrangement.nested.wrap) n++
      if (draft.nested.minimizeArea !== arrangement.nested.minimizeArea) n++
    }
    return n
  }, [draft, arrangement])

  const labelCount = placement.nodes.reduce((a, n) => a + n.positions.length, 0)
  const sel = selected ? placementWithManual.nodes.find((n) => n.path === selected) ?? null : null

  return (
    <div style={S.page} onPointerDown={() => setInteracting(true)} onPointerUp={() => setInteracting(false)}>
      <div style={S.top}>
        <button style={S.ghost} onClick={onClose}>← Organizations</button>
        <b>{org.prefix}</b>
        <button style={S.ghost} onClick={() => canvas.current?.fit()}>Fit</button>
        <select
          value=""
          onChange={(e) => { if (e.target.value) void loadView(e.target.value) }}
          style={S.select}
          title="Open a saved view"
        >
          <option value="">{views.length ? `Open view (${views.length})…` : 'No saved views'}</option>
          {views.map((v) => (
            <option key={v} value={v}>{viewNameOf(org.prefix, v)}</option>
          ))}
        </select>
        <button
          style={S.ghost}
          onClick={() => {
            const name = window.prompt('Name this view', 'compact')
            if (name) void saveView(name.replace(/[^A-Za-z0-9._-]/g, '-'))
          }}
        >
          Save view
        </button>
        <span style={S.exportGroup}>
          <span style={S.dim}>PNG</span>
          {[1, 2, 4].map((s2) => (
            <button key={s2} style={S.ghost} disabled={exporting} onClick={() => void exportPng(s2)}>
              {s2}×
            </button>
          ))}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ ...S.dim, color: /failed|not a valid/i.test(exportNote + viewNote) ? 'var(--bad)' : 'var(--ink-2)' }} data-k="export">
          {exportNote || viewNote}
        </span>
      </div>

      <div style={S.metrics} id="metrics">
        <span data-k="shapes">{placementWithManual.nodes.length} shapes</span>
        <span data-k="labels">{labelCount} labels</span>
        <span data-k="size">{Math.round(placementWithManual.width)}×{Math.round(placementWithManual.height)}</span>
        <span data-k="ratio">
          ratio {(placementWithManual.width / placementWithManual.height).toFixed(2)} / window{' '}
          {(windowAt.w / windowAt.h).toFixed(2)}
        </span>
        <span data-k="layout">layout {layoutMs.toFixed(1)} ms</span>
        <span data-k="fps">fps {fps ? fps.toFixed(0) : '—'}</span>
        <span data-k="worst">worst {Number.isFinite(worst) ? worst.toFixed(0) : '—'}</span>
        {/*
          Loud on purpose (#34): half the v2 option space has no engine behind it
          until #35, and a fallback the user cannot see is the v1 defect this
          effort exists to remove. The nearest working layout is drawn, and said so.
        */}
        {placement.unsupported && (
          <span data-k="unsupported" style={S.warn}>
            ⚠ {placement.unsupported}
          </span>
        )}
      </div>

      <div
        style={{
          ...S.body,
          gridTemplateColumns: railCollapsed && arrangeCollapsed ? '1fr 28px' : '1fr 318px',
        }}
      >
        <div style={S.canvasWrap} ref={wrapRef}>
          <Canvas
            ref={canvas}
            placement={placementWithManual}
            style={style}
            shape={shape}
            detail={detail}
            selected={selected}
            onSelect={setSelected}
            manual={manualPaths}
            onMove={onMove}
            onResize={onResize}
          />
        </div>
        <div style={S.railCol}>
          <ArrangePanel
            draft={draft}
            onChange={setDraft}
            pending={pending}
            manualCount={manualCount}
            onArrange={() => arrange()}
            collapsed={arrangeCollapsed}
            onCollapse={setArrangeCollapsed}
          />
          <Inspector
          selected={sel}
          depths={depths}
          roles={org.roles}
          style={style}
          detail={detail}
          filter={filter}
          onPatchLayer={patchLayer}
          onToggleDetail={toggleDetail}
          onFilter={changeFilter}
            collapsed={railCollapsed}
            onCollapse={setRailCollapsed}
          />
        </div>
      </div>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100%' },
  top: { display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--rule)', flexWrap: 'wrap' },
  metrics: { display: 'flex', gap: 18, padding: '5px 12px', background: '#fbfcfd', borderBottom: '1px solid var(--rule)', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' },
  body: { display: 'grid', minHeight: 0 },
  canvasWrap: { position: 'relative', minWidth: 0, overflow: 'hidden' },
  railCol: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden' },
  rail: { borderLeft: '1px solid var(--rule)', background: '#fbfcfd', padding: '12px 14px', overflowY: 'auto', fontSize: 12 },
  h3: { margin: '0 0 8px', fontSize: 12, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--ink-3)' },
  h4: { margin: '14px 0 6px', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-3)' },
  railMeta: { margin: '0 0 8px', color: 'var(--ink-2)', lineHeight: 1.5 },
  provTable: { borderCollapse: 'collapse', width: '100%' },
  provKey: { padding: '2px 0', color: 'var(--ink-2)' },
  provVal: { padding: '2px 0', textAlign: 'right' },
  ghost: { background: 'transparent', border: '1px solid var(--rule)', padding: '5px 11px', borderRadius: 5, cursor: 'pointer', fontSize: 12 },
  dim: { color: 'var(--ink-3)', fontSize: 12 },
  exportGroup: { display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid var(--rule)', borderRadius: 5, padding: '0 6px' },
  select: { border: '1px solid var(--rule)', borderRadius: 5, padding: '4px 8px', fontSize: 12 },
  warn: { color: '#8a5300', background: '#fff6e0', border: '1px solid #f0d9a0', borderRadius: 4, padding: '1px 7px' },
}
