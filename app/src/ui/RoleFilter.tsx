import { useMemo, useState } from 'react'

/**
 * Roles are the axis that makes a large organization readable: filtered to
 * ProductOwner / DomainArchitect / SystemArchitect, acme-medium drops from
 * 1904×1432 to 1653×802 (#20). acme-tiny has ten distinct Roles, so search
 * carries the list rather than the list carrying itself.
 */
export function RoleFilter({
  roles,
  selected,
  onChange,
}: {
  roles: readonly string[]
  selected: ReadonlySet<string>
  onChange(next: Set<string>): void
}) {
  const [q, setQ] = useState('')
  const shown = useMemo(
    () => roles.filter((r) => r.toLowerCase().includes(q.trim().toLowerCase())),
    [roles, q],
  )
  const all = selected.size === 0

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${roles.length} Roles`}
          style={S.search}
        />
        <button style={S.btn} onClick={() => onChange(new Set())} disabled={all}>
          All
        </button>
      </div>
      <div style={S.list}>
        {shown.map((r) => (
          <label key={r} style={S.item}>
            <input
              type="checkbox"
              checked={all || selected.has(r)}
              onChange={() => {
                // Empty means "every Role" (#18), so unticking one from the
                // all-Roles state has to start from the full set, not from empty.
                const base = all ? new Set(roles) : new Set(selected)
                base.has(r) ? base.delete(r) : base.add(r)
                onChange(base.size === roles.length ? new Set() : base)
              }}
            />
            <span style={S.name}>{r}</span>
          </label>
        ))}
        {shown.length === 0 && <p style={S.none}>No Role matches “{q}”.</p>}
      </div>
      <p style={S.summary}>{all ? 'all Roles' : `${selected.size} of ${roles.length}`}</p>
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 6 },
  head: { display: 'flex', gap: 6 },
  search: { flex: 1, minWidth: 0, border: '1px solid var(--rule)', borderRadius: 4, padding: '4px 7px', fontSize: 12 },
  btn: { border: '1px solid var(--rule)', background: 'var(--surface)', borderRadius: 4, padding: '4px 9px', fontSize: 12, cursor: 'pointer' },
  list: { maxHeight: 220, overflowY: 'auto', border: '1px solid var(--rule)', borderRadius: 4, background: 'var(--surface)' },
  item: { display: 'flex', gap: 7, alignItems: 'center', padding: '3px 8px', fontSize: 12, cursor: 'pointer' },
  name: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  none: { padding: '8px 10px', margin: 0, fontSize: 12, color: 'var(--ink-3)' },
  summary: { margin: 0, fontSize: 11, color: 'var(--ink-3)' },
}
