import type { Arrangement, ArrangementDoc, NestedWrap, ShapeKind, TreeDirection } from '../files/types'

/**
 * The Arrange panel (#36).
 *
 * Everything here is a DRAFT. Nothing on this panel changes the diagram — not the
 * tab, not a dropdown, not the shape — until **Arrange** is pressed. That is what
 * makes browsing free: you can open the other tab, see what it offers and go back
 * without having destroyed the hand-placed geometry you were working on.
 *
 * Exactly one control on this panel is destructive, and it is the one labelled with
 * what it will destroy.
 */
const ARRANGEMENTS = ['nested', 'tree'] as const satisfies readonly Arrangement[]
const SHAPES = ['rectangle', 'ellipse'] as const satisfies readonly ShapeKind[]
const TREE_DIRECTIONS = ['left-to-right', 'top-to-bottom', 'radial'] as const satisfies readonly TreeDirection[]
const NESTED_WRAPS = [
  'fit',
  'left-to-right-then-top-to-bottom',
  'top-to-bottom-then-left-to-right',
] as const satisfies readonly NestedWrap[]

export function ArrangePanel({
  draft,
  onChange,
  pending,
  manualCount,
  onArrange,
  collapsed,
  onCollapse,
}: {
  draft: ArrangementDoc
  onChange(next: ArrangementDoc): void
  /** How many settings differ from what is currently drawn. */
  pending: number
  manualCount: number
  onArrange(): void
  collapsed: boolean
  onCollapse(v: boolean): void
}) {
  if (collapsed) {
    return (
      <div style={S.shut}>
        <button
          style={S.chevron}
          onClick={() => onCollapse(false)}
          title={pending ? `Show arrange — ${pending} pending` : 'Show arrange'}
        >
          ▸{pending ? '•' : ''}
        </button>
      </div>
    )
  }

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <button style={S.chevron} onClick={() => onCollapse(true)} title="Hide arrange">
          ▾ arrange
        </button>
      </div>

      <div style={S.tabs}>
        {ARRANGEMENTS.map((a) => (
          <button
            key={a}
            onClick={() => onChange({ ...draft, active: a })}
            style={{ ...S.tab, ...(draft.active === a ? S.tabOn : {}) }}
          >
            {a}
          </button>
        ))}
      </div>

      {draft.active === 'tree' ? (
        <>
          <Row label="direction">
            <select
              value={draft.tree.direction}
              onChange={(e) =>
                onChange({ ...draft, tree: { ...draft.tree, direction: e.target.value as TreeDirection } })
              }
              style={S.select}
            >
              {TREE_DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Row>
          {/*
            Radial is already one concentric arrangement of the whole tree, so there
            are no blocks to pack. The option is INAPPLICABLE rather than refused
            (#35), and the honest way to say that is not to offer it.
          */}
          {draft.tree.direction !== 'radial' && (
            <Check
              label="pack subtrees to fit the window"
              checked={draft.tree.packSubtrees}
              onChange={(v) => onChange({ ...draft, tree: { ...draft.tree, packSubtrees: v } })}
            />
          )}
        </>
      ) : (
        <>
          <Row label="wrap">
            <select
              value={draft.nested.wrap}
              onChange={(e) =>
                onChange({ ...draft, nested: { ...draft.nested, wrap: e.target.value as NestedWrap } })
              }
              style={S.select}
            >
              {NESTED_WRAPS.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </Row>
          {/*
            Inapplicable under `ellipse` (#42): the ellipse packer reorders
            unconditionally — organ-pipe ordering is how it fits children to the
            curve — so the option has nothing left to do. Hidden rather than
            offered-and-ignored, the same treatment `packSubtrees` gets under
            `radial`. Hidden does NOT mean off: ellipse reorders regardless.
          */}
          {draft.shape !== 'ellipse' && (
            <Check
              label="reorder Teams to fill rows"
              checked={draft.nested.reorderToFill}
              onChange={(v) => onChange({ ...draft, nested: { ...draft.nested, reorderToFill: v } })}
            />
          )}
        </>
      )}

      {/* Shape is global, so it sits outside the tabs — it belongs to neither. */}
      <Row label="shape">
        <span style={S.seg}>
          {SHAPES.map((s) => (
            <button
              key={s}
              onClick={() => onChange({ ...draft, shape: s })}
              style={{ ...S.segBtn, ...(draft.shape === s ? S.segOn : {}) }}
            >
              {s}
            </button>
          ))}
        </span>
      </Row>

      <button style={{ ...S.apply, ...(pending ? S.applyOn : {}) }} onClick={onArrange} data-k="arrange">
        Arrange{pending ? ` · ${pending} pending` : ''}
      </button>
      {manualCount > 0 && (
        <p style={S.warn} data-k="discards">
          discards {manualCount} hand-placed shape{manualCount === 1 ? '' : 's'}
        </p>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={S.row}>
      <span style={S.label}>{label}</span>
      {children}
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label style={S.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap: { borderLeft: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '10px 14px 12px', background: '#fbfcfd' },
  shut: { borderLeft: '1px solid var(--rule)', borderBottom: '1px solid var(--rule)', padding: '6px 4px', background: '#fbfcfd', textAlign: 'center' },
  head: { marginBottom: 8 },
  chevron: {
    border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 11,
    letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--ink-3)',
  },
  tabs: { display: 'flex', gap: 4, marginBottom: 10 },
  tab: {
    flex: 1, padding: '5px 8px', fontSize: 12, cursor: 'pointer',
    border: '1px solid var(--rule)', borderRadius: 5, background: '#fff', color: 'var(--ink-2)',
  },
  tabOn: { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' },
  row: { display: 'block', marginBottom: 8 },
  label: { display: 'block', fontSize: 11, color: 'var(--ink-3)', marginBottom: 3 },
  select: { width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid var(--rule)', borderRadius: 5 },
  seg: { display: 'inline-flex', border: '1px solid var(--rule)', borderRadius: 5, overflow: 'hidden', width: '100%' },
  segBtn: { flex: 1, padding: '4px 8px', fontSize: 12, border: 'none', background: '#fff', cursor: 'pointer', color: 'var(--ink-2)' },
  segOn: { background: 'var(--ink)', color: '#fff' },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', marginBottom: 8 },
  apply: {
    width: '100%', padding: '7px 10px', fontSize: 13, cursor: 'pointer', marginTop: 2,
    border: '1px solid var(--rule)', borderRadius: 5, background: '#fff', color: 'var(--ink-2)',
  },
  applyOn: { background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)', fontWeight: 600 },
  warn: { margin: '6px 0 0', fontSize: 11, color: '#8a5300' },
}
