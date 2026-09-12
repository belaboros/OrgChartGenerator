#!/usr/bin/env bash
#
# Start the OrgChart Workbench dev server.
#
# Runs in the foreground by default, so Ctrl-C stops it. `--detach` puts it in the
# background and prints the pid.
#
# Refuses rather than failing obscurely: if the workbench is already up this exits
# happily without starting a second one, and if something else holds the port it
# says so instead of letting Vite die on --strictPort.
#
# Exit: 0 started (or already running), 1 port unavailable, 2 usage or missing dependencies.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$SCRIPT_DIR/app"
PORT="${PORT:-5180}"
DETACH=0

usage() {
  cat <<'MSG'
Start the OrgChart Workbench dev server.

  ./02_run.sh                    foreground on the default port (5180); Ctrl-C stops it
  ./02_run.sh --detach           background; prints the pid and the log file
  ./02_run.sh --port 5173        another port
  PORT=5173 ./02_run.sh          same, via the environment

Then open the printed URL in Chrome or Edge — the workbench writes files back, which
needs the File System Access API.

Exit: 0 started (or already running), 1 port unavailable, 2 usage or missing dependencies.
MSG
  exit "${1:-2}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --port) [ $# -ge 2 ] || usage; PORT="$2"; shift 2 ;;
    -d|--detach) DETACH=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

command -v npm >/dev/null 2>&1 || { echo "npm is required" >&2; exit 2; }
[ -d "$APP_DIR" ] || { echo "no app directory at $APP_DIR" >&2; exit 2; }

if [ ! -x "$APP_DIR/node_modules/.bin/vite" ]; then
  echo "dependencies are not installed" >&2
  echo "  cd app && npm install" >&2
  exit 2
fi

URL="http://localhost:$PORT"
OPEN_URL="$URL/?files=http"
LOG="/tmp/orgchart-dev-$PORT.log"
PIDFILE="/tmp/orgchart-dev-$PORT.pid"

# Already up? Reuse the status script rather than keeping a second copy of the
# "is it really the workbench" test. Exit 0 there means the workbench answered.
if [ -x "$SCRIPT_DIR/01_status.sh" ] && "$SCRIPT_DIR/01_status.sh" --port "$PORT" >/dev/null 2>&1; then
  echo "ALREADY RUNNING on $URL — leaving it alone"
  echo "  open: $OPEN_URL"
  exit 0
fi

# Not the workbench, but is the port free? Vite with --strictPort would just die,
# and the message would not say what took it.
if command -v lsof >/dev/null 2>&1; then
  HOLDER="$( (lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true) | tr '\n' ' ' | sed 's/ $//')"
  if [ -n "$HOLDER" ]; then
    echo "PORT $PORT IS TAKEN by pid $HOLDER, and it is not the workbench" >&2
    echo "  free it, or start on another port:  ./02_run.sh --port $((PORT + 1))" >&2
    exit 1
  fi
fi

# The project's local Vite binary is launched directly, rather than through
# `npm run dev` (which is exactly `vite` anyway) or `npx`. Measured: both of those
# leave a wrapper process holding the pid we would report while vite listens under a
# different one, so `kill <pid>` returned to the prompt and left the server running.
# Straight to the binary, the pid we print is the server, and killing it works.
VITE="$APP_DIR/node_modules/.bin/vite"
if [ "$DETACH" -eq 1 ]; then
  ( cd "$APP_DIR" && nohup "$VITE" --port "$PORT" --strictPort >"$LOG" 2>&1 & echo $! >"$PIDFILE" )
  PID="$(cat "$PIDFILE")"

  # Wait for it to actually answer before claiming success — a pid proves the
  # process started, not that the server came up.
  for _ in $(seq 1 40); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 1 "$URL/" 2>/dev/null || true)" = "200" ]; then
      # Report the pid that is really LISTENING. Backgrounding a compound command
      # makes `$!` the subshell rather than vite, so the spawned pid can be one off
      # — and a `stop:` line that does not stop anything is worse than none.
      if command -v lsof >/dev/null 2>&1; then
        LISTENER="$( (lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true) | head -1)"
        [ -n "$LISTENER" ] && PID="$LISTENER" && printf '%s\n' "$PID" >"$PIDFILE"
      fi
      echo "STARTED — OrgChart Workbench on $URL (pid $PID)"
      echo "  open: $OPEN_URL"
      echo "  log:  $LOG"
      echo "  stop: kill $PID"
      exit 0
    fi
    sleep 0.25
  done

  echo "started pid $PID but $URL did not answer — see $LOG" >&2
  exit 1
fi

echo "Starting OrgChart Workbench on $URL — Ctrl-C to stop"
echo "  open: $OPEN_URL"
echo
cd "$APP_DIR"
exec "$VITE" --port "$PORT" --strictPort
