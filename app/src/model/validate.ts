/**
 * Schema validation, against the repository's own schemas — not a re-description
 * of them. `schemas/*.json` stays the single source of truth for what a valid file
 * is; this imports them so the app and `scripts/validate.sh` cannot disagree.
 */
// The schemas declare draft 2020-12; Ajv's default entry point is draft-07.
import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv'
import teamsSchema from '../../../schemas/teams.schema.json'
import employeesSchema from '../../../schemas/employees.schema.json'

const ajv = new Ajv2020({ allErrors: true, strict: false })

const validateTeams: ValidateFunction = ajv.compile(teamsSchema)
const validateEmployees: ValidateFunction = ajv.compile(employeesSchema)

const format = (errors: ErrorObject[] | null | undefined): string[] =>
  (errors ?? []).map((e) => `${e.instancePath || '/'}: ${e.message ?? 'invalid'}`)

export function checkTeamsFile(doc: unknown): string[] {
  return validateTeams(doc) ? [] : format(validateTeams.errors)
}

export function checkEmployeesFile(doc: unknown): string[] {
  return validateEmployees(doc) ? [] : format(validateEmployees.errors)
}
