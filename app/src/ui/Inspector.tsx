import { useState } from 'react'
import type { PositionStyle, TeamStyle } from '../files/types'
import type { StyleDoc } from '../view/cascade'
import { positionLayerChain, resolveTeamStyle, teamLayerChain } from '../view/cascade'
import type { PlacedTeam, DetailSwitches } from '../view/layout'
import { LayerEditor } from './LayerEditor'
import { RoleFilter } from './RoleFilter'

/**
 * The Inspector rail, chosen in #22.
 *
 * Selection-first, because that is what people already know — and because it has
 * room for the thing the losing variants could not carry: PROVENANCE, which layer
 * supplied each resolved property. With two cascades of four layers each, "why is
 * this box that colour?" is the question this UI gets asked most.
 */
export function Inspector({
  selected,
  depths,
  roles,
  style,
  detail,
  filter,
  onPatchLayer,
  onToggleDetail,
  onFilter,
  collapsed,
  onCollapse,
}: {
  selected: PlacedTeam | null
  depths: readonly number[]
  roles: readonly string[]
  style: StyleDoc
  detail: DetailSwitches
  filter: ReadonlySet<string>
  onPatchLayer(id: string, patch: Record<string, unknown>): void
  onToggleDetail(k: keyof DetailSwitches): void
  onFilter(next: Set<string>): void
  collapsed: boolean
  onCollapse(v: boolean): void
}) {
  const [tab, setTab] = useState<'selection' | 'layers' | 'view'>('selection')

  if (collapsed) {
    return (
      <aside style={S.collapsed}>
        <button style={S.expand} onClick={() => onCollapse(false)} title="Show the inspector">
          ‹
        </button>
      </aside>
    )
  }

  return (
    <aside style={S.rail}>
      <div style={S.tabs}>
        {(['selection', 'layers', 'view'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...S.tab, ...(tab === t ? S.tabOn : {}) }}>
            {t}
          </button>
        ))}
        <button style={S.collapseBtn} onClick={() => onCollapse(true)} title="Hide the inspector — chrome costs diagram">
          ›
        </button>
      </div>

      <div style={S.body}>
        {tab === 'selection' &&
          (selected ? (
            <>
              <h3 style={S.name}>{selected.name}</h3>
              <p style={S.meta}>{selected.path}</p>
              <p style={S.meta}>
                {selected.positionCount} Positions · {selected.vacantCount} vacant · depth {selected.depth}
              </p>

              <h4 style={S.h4}>Override this shape</h4>
              <p style={S.hint}>
                <code>shape.{selected.path}</code> is the last layer of the Team cascade, so it beats
                everything above it.
              </p>
              <LayerEditor
                kind="team"
                value={style.shape?.[selected.path] ?? {}}
                onChange={(patch) => onPatchLayer(`shape.${selected.path}`, patch)}
              />

              <h4 style={S.h4}>Where each property comes from</h4>
              <table style={S.prov}>
                <tbody>
                  {Object.entries(provenance(style, selected.depth, selected.path)).map(([k, v]) => (
                    <tr key={k}>
                      <td style={S.provK}>{k}</td>
                      <td style={S.provV}>
                        <code>{v}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={S.meta}>
                resolved fill <code>{resolveTeamStyle(style, selected.depth, selected.path).fill}</code>
              </p>
            </>
          ) : (
            <p style={S.hint}>
              Click a Team on the canvas. Positions are labels, not shapes — they cannot be selected (#13).
            </p>
          ))}

        {tab === 'layers' && (
          <>
            <Cascade
              title="Team cascade"
              kind="team"
              layers={teamLayerChain(style, 1, '—')
                .map(([id]) => id)
                .filter((id) => !id.startsWith('shape.'))
                .concat(depths.filter((d) => d > 1).map((d) => `teamDepth.${d}`))
                .concat(Object.keys(style.shape ?? {}).map((p) => `shape.${p}`))}
              style={style}
              onPatchLayer={onPatchLayer}
            />
            <Cascade
              title="Position cascade"
              kind="position"
              layers={positionLayerChain(style, { role: '—', occupantEmail: null, vacant: true })
                .map(([id]) => id)
                .filter((id) => !id.startsWith('role.'))
                .concat(Object.keys(style.role ?? {}).map((r) => `role.${r}`))
                .concat(Object.keys(style.occupant ?? {}).map((e) => `occupant.${e}`))}
              style={style}
              onPatchLayer={onPatchLayer}
            />
          </>
        )}

        {tab === 'view' && (
          <>
            <h4 style={S.h4}>Detail</h4>
            <p style={S.hint}>Independent switches, not a ladder — any combination is reachable (#18).</p>
            {(Object.keys(detail) as (keyof DetailSwitches)[]).map((k) => (
              <label key={k} style={S.check}>
                <input type="checkbox" checked={detail[k]} onChange={() => onToggleDetail(k)} />
                <span>{k}</span>
              </label>
            ))}
            <h4 style={S.h4}>Roles</h4>
            <RoleFilter roles={roles} selected={filter} onChange={onFilter} />
          </>
        )}
      </div>
    </aside>
  )
}

/** Ordered list with rank and property count — the Cascade rail's best idea (#22). */
function Cascade({
  title,
  kind,
  layers,
  style,
  onPatchLayer,
}: {
  title: string
  kind: 'team' | 'position'
  layers: string[]
  style: StyleDoc
  onPatchLayer(id: string, patch: Record<string, unknown>): void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const ordered = [...new Set(layers)]
  return (
    <>
      <h4 style={S.h4}>{title}</h4>
      <p style={S.hint}>Later layers win.</p>
      {ordered.map((id, i) => {
        const v = readLayer(style, id)
        const count = Object.values(v).filter((x) => x !== undefined).length
        return (
          <div key={id} style={S.layer}>
            <button style={S.layerHead} onClick={() => setOpen(open === id ? null : id)}>
              <span style={S.rank}>
                {i + 1}/{ordered.length}
              </span>
              <span
                style={{
                  ...S.chip,
                  background: (v as TeamStyle).fill ?? 'transparent',
                  borderColor: (v as TeamStyle).line ?? 'var(--rule)',
                  borderWidth: Math.max(1, Math.min(3, (v as TeamStyle).border ?? 1)),
                }}
              />
              <span style={S.layerName}>{id}</span>
              <span style={S.count}>{count || '—'}</span>
            </button>
            {open === id && (
              <div style={{ padding: '0 6px 8px' }}>
                <LayerEditor kind={kind} value={v} onChange={(patch) => onPatchLayer(id, patch)} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

function readLayer(style: StyleDoc, id: string): TeamStyle & PositionStyle {
  const [head, rest] = id.split(/\.(.+)/) as [string, string | undefined]
  const bucket = (style as unknown as Record<string, unknown>)[head]
  if (!rest) return (bucket as TeamStyle) ?? {}
  return ((bucket as Record<string, TeamStyle>)?.[rest] as TeamStyle) ?? {}
}

function provenance(style: StyleDoc, depth: number, path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, layer] of teamLayerChain(style, depth, path)) {
    if (!layer) continue
    for (const [k, v] of Object.entries(layer)) if (v !== undefined) out[k] = name
  }
  return out
}

const S: Record<string, React.CSSProperties> = {
  rail: { borderLeft: '1px solid var(--rule)', background: '#fbfcfd', display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 },
  collapsed: { borderLeft: '1px solid var(--rule)', background: '#fbfcfd', width: 28, display: 'flex', justifyContent: 'center', paddingTop: 8 },
  expand: { border: '1px solid var(--rule)', background: 'var(--surface)', borderRadius: 4, cursor: 'pointer', width: 20, height: 24, fontSize: 12 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--rule)', alignItems: 'stretch' },
  tab: { flex: 1, border: 0, background: 'transparent', padding: '9px 0', cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' },
  tabOn: { background: 'var(--surface)', color: 'var(--accent)', boxShadow: 'inset 0 -2px 0 var(--accent)' },
  collapseBtn: { border: 0, borderLeft: '1px solid var(--rule)', background: 'transparent', cursor: 'pointer', padding: '0 9px', color: 'var(--ink-3)' },
  body: { overflowY: 'auto', padding: '12px 14px', fontSize: 12 },
  name: { margin: '0 0 2px', fontSize: 14 },
  meta: { margin: '0 0 4px', color: 'var(--ink-3)', fontSize: 11 },
  hint: { margin: '6px 0', color: 'var(--ink-2)', fontSize: 11, lineHeight: 1.5 },
  h4: { margin: '16px 0 6px', fontSize: 11, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--ink-3)' },
  prov: { borderCollapse: 'collapse', width: '100%' },
  provK: { padding: '2px 0', color: 'var(--ink-2)' },
  provV: { padding: '2px 0', textAlign: 'right' },
  check: { display: 'flex', gap: 7, alignItems: 'center', padding: '3px 0', fontSize: 12 },
  layer: { borderBottom: '1px solid #eef1f4' },
  layerHead: { width: '100%', display: 'flex', alignItems: 'center', gap: 7, border: 0, background: 'transparent', padding: '6px 2px', cursor: 'pointer', fontSize: 12, textAlign: 'left' },
  rank: { fontSize: 9, color: 'var(--ink-3)', width: 24, fontVariantNumeric: 'tabular-nums' },
  chip: { width: 14, height: 14, borderRadius: 3, borderStyle: 'solid', flex: '0 0 auto' },
  layerName: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  count: { fontSize: 10, color: 'var(--ink-3)' },
}
