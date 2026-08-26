/**
 * One YAML entry point for every adapter, so they cannot disagree about parsing.
 *
 * Note on duplicate keys: js-yaml REJECTS them by default. That matters, because
 * the hole `scripts/validate.sh` exists to plug is a PyYAML behaviour — PyYAML
 * silently keeps the last of two identical employee emails, so a file that has
 * quietly lost a record still validates against the schema. JSON Schema cannot see
 * it either. Here the parser catches it for us.
 *
 * `assertRejectsDuplicateKeys` pins that behaviour down: if a future js-yaml ever
 * relaxes it, this fails loudly instead of silently reopening the hole.
 */
import yaml from 'js-yaml'
import { FileAccessError } from './types'

export function parseYaml<T>(text: string, fileName: string): T {
  try {
    return yaml.load(text) as T
  } catch (e) {
    const detail = e instanceof Error ? e.message.split('\n')[0] : String(e)
    throw new FileAccessError(`${fileName} is not valid YAML — ${detail}`)
  }
}

export function assertRejectsDuplicateKeys(): void {
  const sample = 'employees:\n  a@x.com:\n    name: First\n  a@x.com:\n    name: Second\n'
  try {
    yaml.load(sample)
  } catch {
    return // expected
  }
  throw new Error(
    'YAML parser no longer rejects duplicate keys. A file that has silently lost a ' +
      'record would now load as valid — see scripts/validate.sh for why this matters.',
  )
}
