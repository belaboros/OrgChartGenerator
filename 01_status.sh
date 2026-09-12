#!/usr/bin/env bash
#
# Is the OrgChart Workbench dev server running?
#
# Checks that something is listening, that it answers HTTP, and that what answers
# is actually the workbench — a stale process on the port is worth telling apart
# from the real thing.
#
# Exit: 0 running, 1 not running, 2 usage or missing dependencies.

set -euo pipefail

PORT="${PORT:-5180}"

usage() {
  cat <<'MSG'
Is the OrgChart Workbench dev server running?

  ./01_status.sh                 check the default port (5180)
  ./01_status.sh --port 5173     check another port
  PORT=5173 ./01_status.sh       same, via the environment

Exit: 0 running, 1 not running, 2 usage or missing dependencies.
MSG
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) [ $# -ge 2 ] || usage; PORT="$2"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 2; }

URL="http://localhost:$PORT"

# Who is on the port? lsof is not on every machine, so its absence is not fatal —
# it only costs us the PID in the report.
PIDS=""
if command -v lsof >/dev/null 2>&1; then
  # `|| true` matters: with `set -e` and `pipefail`, lsof finding nothing would
  # fail the pipeline, fail the assignment, and kill the script before it printed
  # anything at all — which is precisely the case this script exists to report.
  PIDS="$( (lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true) | tr '\n' ' ' | sed 's/ $//')"
fi

STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$URL/" 2>/dev/null || true)"

if [ "$STATUS" = "000" ] || [ -z "$STATUS" ]; then
  echo "NOT RUNNING — nothing answering on $URL"
  if [ -n "$PIDS" ]; then
    echo "  but something is listening on port $PORT (pid $PIDS) — not serving HTTP"
  fi
  echo
  echo "  start it with:  ./02_run.sh --port $PORT        (or --detach for the background)"
  exit 1
fi

# Something answers. Is it the workbench, or another project on the same port?
BODY="$(curl -s --max-time 3 "$URL/" 2>/dev/null || true)"
if ! printf '%s' "$BODY" | grep -q 'OrgChart Workbench'; then
  echo "PORT IN USE, BUT NOT THE WORKBENCH — $URL answered $STATUS"
  [ -n "$PIDS" ] && echo "  pid $PIDS"
  echo "  something else is on port $PORT; start the workbench on a free one, e.g."
  echo "  cd app && npx vite --port $((PORT + 1)) --strictPort"
  exit 1
fi

echo "RUNNING — OrgChart Workbench on $URL (HTTP $STATUS)"
[ -n "$PIDS" ] && echo "  pid $PIDS"
echo "  open: $URL/?files=http    (Chrome or Edge — the workbench writes files back)"
exit 0
