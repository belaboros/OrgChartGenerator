/**
 * Turns the raw parsed YAML from the file seam into the domain model.
 *
 * Validation happens here rather than in the seam: reading a file and deciding
 * whether it is a valid organization are different jobs, and only this one knows
 * what an organization is.
 */
import type { OrgDoc, RawTeam } from '../files/types'
import { checkEmployeesFile, checkTeamsFile } from './validate'
import { OrgLoadError } from './types'
import type { Employee, Organization, Position, Team, Warning } from './types'

export function buildOrganization(doc: OrgDoc): Organization {
  const teamErrors = checkTeamsFile(doc.teams)
  if (teamErrors.length) {
    throw new OrgLoadError(`${doc.prefix}-teams.yaml is not a valid teams file`, teamErrors)
  }
  const empErrors = checkEmployeesFile(doc.employees)
  if (empErrors.length) {
    throw new OrgLoadError(`${doc.prefix}-employees.yaml is not a valid employees file`, empErrors)
  }

  const warnings: Warning[] = []

  // Both files declare `org`. The binding is NOT enforced (#6 Q7) — a mismatch is
  // worth saying out loud, but it is not a reason to refuse to draw the diagram.
  if (doc.teams.org !== doc.employees.org) {
    warnings.push({
      kind: 'org-name-mismatch',
      message: `teams.yaml says org "${doc.teams.org}", employees.yaml says "${doc.employees.org}"`,
    })
  }

  const employees = new Map<string, Employee>()
  for (const [email, raw] of Object.entries(doc.employees.employees ?? {})) {
    const { name, ...attributes } = raw as { name?: unknown } & Record<string, unknown>
    employees.set(email, {
      email,
      name: typeof name === 'string' ? name : null,
      attributes,
      positions: [],
    })
  }

  const roles = new Set<string>()
  let teamCount = 0
  let positionCount = 0
  let vacantCount = 0
  let maxDepth = 0

  const buildTeam = (name: string, raw: RawTeam, parentPath: string, depth: number): Team => {
    teamCount += 1
    maxDepth = Math.max(maxDepth, depth)
    const path = `${parentPath}/${name}`

    const positions: Position[] = (raw.positions ?? []).map((p) => {
      positionCount += 1
      roles.add(p.role)
      const email = p.occupant ?? null
      const occupant = email ? (employees.get(email) ?? null) : null
      const unresolved = email !== null && occupant === null
      if (unresolved) {
        warnings.push({
          kind: 'unresolved-occupant',
          message: `${path}/${p.role}: no Employee "${email}" in the employees file`,
        })
      }
      // Vacant means no occupant AT ALL. An unresolvable email is a different
      // thing — a seat that claims someone who is not on file — and conflating
      // the two would hide a typo behind a legitimate-looking empty seat.
      const vacant = email === null
      if (vacant) vacantCount += 1
      const position: Position = {
        role: p.role,
        occupantEmail: email,
        occupant,
        vacant,
        unresolved,
        teamPath: path,
        ...(p.description === undefined ? {} : { description: p.description }),
      }
      occupant?.positions.push(position)
      return position
    })

    const children = Object.entries(raw.teams ?? {}).map(([childName, childRaw]) =>
      buildTeam(childName, childRaw, path, depth + 1),
    )

    const subtreePositions =
      positions.length + children.reduce((a, c) => a + c.subtreePositions, 0)
    const subtreeVacant =
      positions.filter((p) => p.vacant).length + children.reduce((a, c) => a + c.subtreeVacant, 0)

    return {
      name,
      path,
      depth,
      positions,
      children,
      positionCount: positions.length,
      vacantCount: positions.filter((p) => p.vacant).length,
      subtreePositions,
      subtreeVacant,
    }
  }

  const orgName = doc.teams.org
  const roots = Object.entries(doc.teams.teams ?? {}).map(([name, raw]) =>
    buildTeam(name, raw, orgName, 1),
  )

  for (const e of employees.values()) {
    if (e.positions.length === 0) {
      warnings.push({ kind: 'seatless-employee', message: `${e.email} occupies no Position` })
    }
  }

  return {
    name: orgName,
    prefix: doc.prefix,
    roots,
    employees,
    roles: [...roles].sort(),
    teamCount,
    positionCount,
    vacantCount,
    maxDepth,
    warnings,
  }
}

/** Depth-first walk in file order, which is the order a diagram draws them in. */
export function walkTeams(org: Organization, visit: (team: Team) => void): void {
  const go = (t: Team): void => {
    visit(t)
    t.children.forEach(go)
  }
  org.roots.forEach(go)
}
