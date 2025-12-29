#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/pradeep/homebeam"
LOG_DIR="$APP_DIR/.logs"
PID_DIR="$APP_DIR/.pids"

mkdir -p "$LOG_DIR" "$PID_DIR"
cd "$APP_DIR"

# If you use nvm, uncomment and adjust:
# export NVM_DIR="/home/pradeep/.nvm"
# [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
# nvm use 22 >/dev/null

echo "[start.sh] Using node: $(node -v), npm: $(npm -v)"

# Stop any old processes we started
if [ -f "$PID_DIR/server.pid" ]; then
  kill "$(cat "$PID_DIR/server.pid")" 2>/dev/null || true
  rm -f "$PID_DIR/server.pid"
fi
if [ -f "$PID_DIR/vite.pid" ]; then
  kill "$(cat "$PID_DIR/vite.pid")" 2>/dev/null || true
  rm -f "$PID_DIR/vite.pid"
fi

# Install deps if needed (optional; comment out if you prefer manual npm ci)
if [ ! -d node_modules ]; then
  echo "[start.sh] node_modules missing; running npm ci..."
  npm ci
fi

echo "[start.sh] Starting backend (server.js)..."
nohup node server.js > "$LOG_DIR/server.log" 2>&1 &
echo $! > "$PID_DIR/server.pid"

echo "[start.sh] Starting frontend (vite dev on 0.0.0.0:5173)..."
nohup npm run dev -- --host 0.0.0.0 --port 5173 > "$LOG_DIR/vite.log" 2>&1 &
echo $! > "$PID_DIR/vite.pid"

echo "[start.sh] Started."
echo "  Backend log: $LOG_DIR/server.log"
echo "  Frontend log: $LOG_DIR/vite.log"
