#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$APP_DIR/run"
LOG_DIR="$APP_DIR/logs"
PID_FILE="$RUN_DIR/dakang_ops.pid"
NODE_BIN="${NODE_BIN:-/home/deploy/.local/node/bin/node}"
NPM_BIN="${NPM_BIN:-/home/deploy/.local/node/bin/npm}"

if [[ ! -x "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node)"
fi

if [[ ! -x "$NPM_BIN" ]]; then
  NPM_BIN="$(command -v npm)"
fi

if [[ -z "${NODE_BIN:-}" || -z "${NPM_BIN:-}" ]]; then
  echo "node or npm binary not found" >&2
  exit 1
fi

mkdir -p "$APP_DIR/data" "$RUN_DIR" "$LOG_DIR"
cd "$APP_DIR"

"$NPM_BIN" ci --omit=dev

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PORT="${PORT:-3200}"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" || true)"
  if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill "$OLD_PID"
    for _ in $(seq 1 10); do
      if ! kill -0 "$OLD_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done

    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID"
    fi
  fi
  rm -f "$PID_FILE"
fi

nohup "$NODE_BIN" src/server.js >> "$LOG_DIR/server.out.log" 2>> "$LOG_DIR/server.err.log" &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
    echo "dakang_ops is healthy on port ${PORT}"
    exit 0
  fi
  sleep 1
done

echo "health check failed for dakang_ops on port ${PORT}" >&2
tail -n 50 "$LOG_DIR/server.err.log" || true
exit 1
