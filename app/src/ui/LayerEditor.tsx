import type { PositionStyle, ShapeKind, TeamStyle } from '../files/types'

type Any = TeamStyle & PositionStyle
type Patch = Partial<Record<keyof Any, string | number | ShapeKind | undefined>>

const COLOURS = ['fill', 'line', 'text'] as const
const NUMBERS = ['border', 'font', 'margin'] as const

/** Which properties a layer may carry depends on which cascade it belongs to (#18). */
export function LayerEditor({
  value,
  kind,
  onChange,
}: {
  value: Any
  kind: 'team' | 'position'
  onChange(patch: Patch): void
}) {
  const colours = kind === 'team' ? COLOURS : (['fill', 'text'] as const)
  const numbers = kind === 'team' ? NUMBERS : (['font'] as const)
  return (
    <div style={S.wrap}>
      {kind === 'team' && (
        <label style={S.row}>
          <span>shape</span>
          <select
            value={(value.shape as string) ?? ''}
            onChange={(e) => onChange({ shape: (e.target.value || undefined) as ShapeKind | undefined })}
            style={S.input}
          >
            <option value="">inherit</option>
            <option value="rectangle">rectangle</option>
            <option value="circle">circle</option>
          </select>
        </label>
      )}
      {colours.map((k) => (
        <label key={k} style={S.row}>
          <span>{k}</span>
          <span style={S.pair}>
            <input
              type="color"
              value={typeof value[k] === 'string' && value[k] !== 'transparent' ? (value[k] as string) : '#ffffff'}
              onChange={(e) => onChange({ [k]: e.target.value } as Patch)}
              style={S.swatch}
              aria-label={k}
            />
            <button style={S.clear} onClick={() => onChange({ [k]: undefined } as Patch)} title="inherit">
              ×
            </button>
          </span>
        </label>
      ))}
      {numbers.map((k) => (
        <label key={k} style={S.row}>
          <span>{k}</span>
          <input
            type="number"
            step={0.5}
            value={(value[k] as number | undefined) ?? ''}
            placeholder="inherit"
            onChange={(e) => onChange({ [k]: e.target.value === '' ? undefined : Number(e.target.value) } as Patch)}
            style={{ ...S.input, width: 74 }}
          />
        </label>
      ))}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 },
  pair: { display: 'flex', gap: 4, alignItems: 'center' },
  swatch: { width: 34, height: 22, padding: 0, border: '1px solid var(--rule)', borderRadius: 4, background: 'none' },
  clear: { border: '1px solid var(--rule)', background: 'var(--surface)', borderRadius: 4, cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: '3px 5px' },
  input: { border: '1px solid var(--rule)', borderRadius: 4, padding: '3px 6px', fontSize: 12 },
}
