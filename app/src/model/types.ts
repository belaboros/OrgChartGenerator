/**
 * The domain model. Vocabulary is `CONTEXT.md`'s and nothing else: Team, Position,
 * Role, Employee, Occupant, Path.
 */

export interface Organization {
  /** The `org:` value, e.g. `ACME`. Forms the root segment of every Path. */
  name: string
  /** The file prefix, e.g. `acme-tiny`. */
  prefix: string
  /** Root Teams. The example organizations are FORESTS, not trees — acme-large has five. */
  roots: Team[]
  employees: Map<string, Employee>
  /** Distinct Roles across the whole organization, sorted. What the filter filters on. */
  roles: string[]
  teamCount: number
  positionCount: number
  vacantCount: number
  /** Deepest nesting level; root Teams are depth 1. Drives the style/arrangement cascades. */
  maxDepth: number
  warnings: Warning[]
}

export interface Team {
  name: string
  /** `ACME/retail/OrderManagement`. A display label, not an identity (#7, #13). */
  path: string
  depth: number
  positions: Position[]
  children: Team[]
  /** Positions in this Team only. */
  positionCount: number
  vacantCount: number
  /** Positions in this Team and every Team beneath it. */
  subtreePositions: number
  subtreeVacant: number
}

/**
 * A seat. Deliberately has NO identity (#13): two Positions sharing a Role within
 * one Team are indistinguishable, and nothing in v1 addresses one.
 */
export interface Position {
  role: string
  /** The email as written, even when it resolves to nobody. */
  occupantEmail: string | null
  occupant: Employee | null
  vacant: boolean
  /** An occupant email that matches no Employee. A warning, never an error (#6 Q7). */
  unresolved: boolean
  description?: string
  /** The Team this Position belongs to. A Position belongs to exactly one Team. */
  teamPath: string
}

export interface Employee {
  email: string
  name: string | null
  /** Open set — Employee is open where Position is closed (#9). */
  attributes: Record<string, unknown>
  /** Every Position this Employee occupies; may span several Teams. */
  positions: Position[]
}

export type WarningKind =
  | 'unresolved-occupant'
  | 'org-name-mismatch'
  | 'seatless-employee'

export interface Warning {
  kind: WarningKind
  message: string
}

export class OrgLoadError extends Error {
  constructor(message: string, readonly detail?: string[]) {
    super(message)
    this.name = 'OrgLoadError'
  }
}
