#!/usr/bin/env bash
#
# Validate OrgChartGenerator YAML files against the shipped JSON Schemas.
#
# Exit: 0 all valid, 1 a file failed validation, 2 usage or missing dependencies.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SCHEMA_DIR="$REPO_DIR/schemas"
VENV="$REPO_DIR/.venv"

usage() {
  cat <<'MSG'
Validate OrgChartGenerator YAML files against the shipped JSON Schemas.

  ./scripts/validate.sh acme-tiny-teams.yaml       one file
  ./scripts/validate.sh acme-small                 both -teams.yaml and -employees.yaml
  ./scripts/validate.sh acme-small acme-large      several prefixes or paths
  ./scripts/validate.sh --setup                    create .venv with the dependencies

Exit: 0 all valid, 1 a file failed validation, 2 usage or missing dependencies.
MSG
  exit "${1:-2}"
}

find_python() {
  local c
  for c in "${ORGCHART_PYTHON:-}" "$VENV/bin/python" python3 python; do
    [ -n "$c" ] && command -v "$c" >/dev/null 2>&1 || continue
    "$c" -c 'import yaml, jsonschema' >/dev/null 2>&1 && { echo "$c"; return 0; }
  done
  return 1
}

do_setup() {
  command -v python3 >/dev/null 2>&1 || { echo "validate.sh: python3 not found" >&2; exit 2; }
  echo "Creating $VENV ..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q pyyaml jsonschema
  echo "Done. ./scripts/validate.sh will use it automatically."
}

[ $# -gt 0 ] || usage 2
case "${1:-}" in
  -h|--help) usage 0 ;;
  --setup)   do_setup; exit 0 ;;
esac

# A path is taken as-is; a bare prefix becomes both of an organization's files.
files=()
for arg in "$@"; do
  case "$arg" in
    *.yaml|*.yml) files+=("$arg") ;;
    *)            files+=("${arg}-teams.yaml" "${arg}-employees.yaml") ;;
  esac
done

missing=0
for f in "${files[@]}"; do
  [ -f "$f" ] || { echo "validate.sh: no such file: $f" >&2; missing=1; }
done
[ "$missing" -eq 0 ] || exit 2

if ! PY="$(find_python)"; then
  cat >&2 <<'MSG'
validate.sh: needs Python with `pyyaml` and `jsonschema`.

  ./scripts/validate.sh --setup                            create a local .venv
  ORGCHART_PYTHON=/path/to/python ./scripts/validate.sh ... use an existing one
MSG
  exit 2
fi

exec "$PY" - "$SCHEMA_DIR" "${files[@]}" <<'PYEOF'
import json, sys, os, yaml
from jsonschema import Draft202012Validator

schema_dir, paths = sys.argv[1], sys.argv[2:]

# Reject duplicate mapping keys. PyYAML keeps the last silently, which would let two
# Employees share an email and still validate. JSON Schema cannot see this.
class StrictLoader(yaml.SafeLoader):
    pass

def no_duplicates(loader, node, deep=False):
    out = {}
    for kn, vn in node.value:
        k = loader.construct_object(kn, deep=deep)
        if k in out:
            raise yaml.constructor.ConstructorError(
                None, None, f"duplicate key {k!r}", kn.start_mark)
        out[k] = loader.construct_object(vn, deep=deep)
    return out

StrictLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, no_duplicates)

def schema_for(path):
    base = os.path.basename(path)
    for suffix, name in (("-teams.yaml", "teams"), ("-teams.yml", "teams"),
                         ("-employees.yaml", "employees"), ("-employees.yml", "employees")):
        if base.endswith(suffix):
            return os.path.join(schema_dir, f"{name}.schema.json")
    return None

failed = False
for path in paths:
    schema_path = schema_for(path)
    if schema_path is None:
        print(f"FAIL  {path}\n      cannot tell which schema applies: expected a name "
              f"ending -teams.yaml or -employees.yaml")
        failed = True
        continue
    if not os.path.exists(schema_path):
        print(f"FAIL  {path}\n      schema not found: {schema_path}")
        failed = True
        continue

    try:
        with open(path) as fh:
            data = yaml.load(fh, Loader=StrictLoader)
    except yaml.YAMLError as e:
        mark = getattr(e, "problem_mark", None) or getattr(e, "context_mark", None)
        where = f" (line {mark.line + 1})" if mark else ""
        print(f"FAIL  {path}\n      {getattr(e, 'problem', e)}{where}")
        failed = True
        continue

    validator = Draft202012Validator(json.load(open(schema_path)))
    errors = sorted(validator.iter_errors(data), key=lambda e: list(e.path))
    if not errors:
        print(f"ok    {path}  ({os.path.basename(schema_path)})")
        continue

    failed = True
    print(f"FAIL  {path}  ({os.path.basename(schema_path)})  {len(errors)} error(s)")
    for e in errors[:10]:
        loc = "/".join(str(p) for p in e.path) or "(root)"
        print(f"      {loc}: {e.message}")
    if len(errors) > 10:
        print(f"      ... and {len(errors) - 10} more")

sys.exit(1 if failed else 0)
PYEOF
