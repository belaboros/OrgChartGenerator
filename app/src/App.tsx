import { useCallback, useEffect, useState } from 'react'
import type { Files } from './files/types'
import { FileAccessError } from './files/types'
import { createFsaFiles, isSupported, pickWorkingDirectory, restoreWorkingDirectory } from './files/fsa'
import { createHttpFiles } from './files/http'
import { assertRejectsDuplicateKeys } from './files/yaml'
import { buildOrganization, walkTeams } from './model/build'
import { OrgLoadError } from './model/types'
import type { Organization } from './model/types'
import { Workbench } from './Workbench'

/** ?files=http selects the dev adapter (see files/http.ts). */
const useDevFiles = new URLSearchParams(location.search).get('files') === 'http'

interface Found {
  prefix: string
  org: Organization | null
  failure: string | null
  detail: string[]
  views: string[]
}

/** Evidence that acme-tiny's deliberate oddities survive the load (#24). */
function oddities(org: Organization): { label: string; got: string; ok: boolean }[] {
  const teams: ReturnType<typeof collect> = collect(org)
  const vacancies = teams.flatMap((t) => t.positions).filter((p) => p.vacant).length
  const multiSeat = [...org.employees.values()].filter((e) => e.positions.length > 1)
  const emptyTeams = teams.filter((t) => t.positions.length === 0 && t.children.length === 0)
  const sharedRole = teams.filter(
    (t) => new Set(t.positions.map((p) => p.role)).size < t.positions.length,
  )
  const seatless = [...org.employees.values()].filter((e) => e.positions.length === 0)
  const spans = multiSeat.map(
    (e) => `${e.email} in ${new Set(e.positions.map((p) => p.teamPath)).size} Teams`,
  )
  return [
    { label: 'vacant Positions', got: String(vacancies), ok: vacancies === 3 },
    { label: 'Employee in >1 Team', got: spans.join(', ') || 'none', ok: spans.length === 1 },
    { label: 'Team with nothing in it', got: emptyTeams.map((t) => t.name).join(', ') || 'none', ok: emptyTeams.length >= 1 },
    { label: 'Teams with a shared Role', got: sharedRole.map((t) => t.name).join(', ') || 'none', ok: sharedRole.length === 2 },
    { label: 'Employee with no Position', got: seatless.map((e) => e.email).join(', ') || 'none', ok: seatless.length === 1 },
  ]
}

function collect(org: Organization) {
  const out: Parameters<Parameters<typeof walkTeams>[1]>[0][] = []
  walkTeams(org, (t) => out.push(t))
  return out
}

export function App() {
  const [files, setFiles] = useState<Files | null>(null)
  const [dirName, setDirName] = useState<string>('')
  const [found, setFound] = useState<Found[] | null>(null)
  const [error, setError] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<Organization | null>(null)

  const scan = useCallback(async (f: Files) => {
    setBusy(true)
    setError('')
    try {
      assertRejectsDuplicateKeys()
      const prefixes = await f.listOrgs()
      const rows: Found[] = []
      for (const prefix of prefixes) {
        const views = await f.listViews(prefix)
        try {
          const org = buildOrganization(await f.loadOrg(prefix))
          rows.push({ prefix, org, failure: null, detail: [], views })
        } catch (e) {
          rows.push({
            prefix,
            org: null,
            failure: e instanceof Error ? e.message : String(e),
            detail: e instanceof OrgLoadError ? (e.detail ?? []) : [],
            views,
          })
        }
      }
      setFound(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFound(null)
    } finally {
      setBusy(false)
    }
  }, [])

  const choose = useCallback(async () => {
    try {
      const dir = await pickWorkingDirectory()
      const f = createFsaFiles(dir)
      setDirName(dir.name)
      setFiles(f)
      await scan(f)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return // user closed the picker
      setError(e instanceof FileAccessError || e instanceof Error ? e.message : String(e))
    }
  }, [scan])

  useEffect(() => {
    void (async () => {
      if (useDevFiles) {
        const f = createHttpFiles()
        setDirName('repository root (dev adapter)')
        setFiles(f)
        await scan(f)
        return
      }
      const dir = await restoreWorkingDirectory()
      if (!dir) return
      const f = createFsaFiles(dir)
      setDirName(dir.name)
      setFiles(f)
      await scan(f)
    })()
  }, [scan])

  if (open && files) return <Workbench org={open} files={files} onClose={() => setOpen(null)} />

  return (
    <main style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>OrgChart Workbench</h1>
        <p style={S.lede}>
          Find the right visual representation of an organization. Point it at the folder holding your{' '}
          <code>&lt;org&gt;-teams.yaml</code> and <code>&lt;org&gt;-employees.yaml</code> files.
        </p>
      </header>

      {!isSupported() && !useDevFiles && (
        <p style={S.warn}>
          This workbench needs the File System Access API, which today means <b>Chrome or Edge</b>. Safari
          and Firefox cannot open a folder or write a view back to it.
        </p>
      )}

      <section style={S.bar}>
        <button
          style={{ ...S.primary, ...(!isSupported() || useDevFiles ? S.disabled : null) }}
          onClick={() => void choose()}
          disabled={!isSupported() || useDevFiles}
        >
          {files ? 'Choose a different folder' : 'Choose folder…'}
        </button>
        {dirName && <span style={S.dim}>{dirName}</span>}
        {files && (
          <button style={S.ghost} onClick={() => void scan(files)} disabled={busy}>
            {busy ? 'Scanning…' : 'Rescan'}
          </button>
        )}
      </section>

      {error && <p style={S.err}>{error}</p>}

      {found && (
        found.length === 0 ? (
          <p style={S.dim}>
            No organizations here. One needs <b>both</b> halves — a <code>-teams.yaml</code> and a matching{' '}
            <code>-employees.yaml</code>.
          </p>
        ) : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Organization</th>
                <th style={S.thNum}>Teams</th>
                <th style={S.thNum}>Positions</th>
                <th style={S.thNum}>Vacant</th>
                <th style={S.thNum}>Employees</th>
                <th style={S.thNum}>Roles</th>
                <th style={S.thNum}>Depth</th>
                <th style={S.thNum}>Warnings</th>
                <th style={S.th} />
              </tr>
            </thead>
            <tbody>
              {found.map((o) => (
                <tr key={o.prefix} data-org={o.prefix}>
                  <td style={S.td}><b>{o.prefix}</b></td>
                  {o.org ? (
                    <>
                      <td style={S.tdNum}>{o.org.teamCount}</td>
                      <td style={S.tdNum}>{o.org.positionCount}</td>
                      <td style={S.tdNum}>{o.org.vacantCount}</td>
                      <td style={S.tdNum}>{o.org.employees.size}</td>
                      <td style={S.tdNum}>{o.org.roles.length}</td>
                      <td style={S.tdNum}>{o.org.maxDepth}</td>
                      <td style={S.tdNum}>{o.org.warnings.length}</td>
                      <td style={S.td}>
                        <button style={S.open} onClick={() => setOpen(o.org)}>Open</button>
                      </td>
                    </>
                  ) : (
                    <td colSpan={8} style={{ ...S.td, color: 'var(--bad)' }}>
                      {o.failure}
                      {o.detail.length > 0 && <div style={S.dim}>{o.detail.slice(0, 3).join(' · ')}</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}

      {found?.find((f) => f.prefix === 'acme-tiny')?.org && (
        <section style={S.panel} data-testid="oddities">
          <h2 style={S.h2}>acme-tiny — the cases the model exists for</h2>
          <p style={S.dim}>
            The hand-written example deliberately exercises every awkward case. If any of these
            stops holding, the model has quietly lost something.
          </p>
          <table style={S.table}>
            <tbody>
              {oddities(found.find((f) => f.prefix === 'acme-tiny')!.org!).map((r) => (
                <tr key={r.label} data-ok={r.ok}>
                  <td style={S.td}>{r.label}</td>
                  <td style={S.td}><code>{r.got}</code></td>
                  <td style={{ ...S.td, color: r.ok ? '#1f6b34' : 'var(--bad)' }}>{r.ok ? 'holds' : 'BROKEN'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <footer style={S.foot}>
        Model loaded — rendering it is <a href="https://github.com/belaboros/OrgChartGenerator/issues/25">#25</a>.
      </footer>
    </main>
  )
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 980, margin: '0 auto', padding: '48px 24px 64px' },
  head: { borderBottom: '2px solid var(--ink)', paddingBottom: 20, marginBottom: 24 },
  h1: { margin: '0 0 8px', fontSize: 30, letterSpacing: '-.02em' },
  lede: { margin: 0, color: 'var(--ink-2)', maxWidth: '62ch' },
  bar: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 },
  disabled: { opacity: .45, cursor: 'not-allowed' },
  primary: { background: 'var(--accent)', color: '#fff', border: 0, padding: '9px 16px', borderRadius: 6, cursor: 'pointer' },
  ghost: { background: 'transparent', border: '1px solid var(--rule)', padding: '8px 14px', borderRadius: 6, cursor: 'pointer' },
  dim: { color: 'var(--ink-3)' },
  warn: { background: '#fff6e5', border: '1px solid #f0d9a8', padding: '12px 14px', borderRadius: 6 },
  err: { color: 'var(--bad)', background: '#fdeceb', border: '1px solid #f3c9c5', padding: '12px 14px', borderRadius: 6 },
  table: { width: '100%', borderCollapse: 'collapse', background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8 },
  th: { textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--rule)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' },
  thNum: { textAlign: 'right', padding: '10px 14px', borderBottom: '1px solid var(--rule)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-3)' },
  td: { padding: '10px 14px', borderBottom: '1px solid #eef1f4' },
  tdNum: { padding: '10px 14px', borderBottom: '1px solid #eef1f4', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  panel: { marginTop: 32 },
  open: { background: 'var(--accent)', color: '#fff', border: 0, padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12 },
  h2: { fontSize: 17, margin: '0 0 6px' },
  foot: { marginTop: 28, color: 'var(--ink-3)', fontSize: 13 },
}
