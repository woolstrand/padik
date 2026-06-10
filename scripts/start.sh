#!/usr/bin/env bash
# start.sh — Start the Padik game engine and UI dev server.
# Run setup.sh first to install dependencies.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
  echo ""
  echo "==> Stopping servers..."
  kill "$ENGINE_PID" "$UI_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting Padik"
echo ""

# ── Game engine ───────────────────────────────────────────────────────────────
echo "--> Starting game engine on http://localhost:3001 ..."
cd "$REPO_ROOT/engine"
npm run dev &
ENGINE_PID=$!

# Give the engine a moment to start
sleep 2

# ── UI dev server ─────────────────────────────────────────────────────────────
echo "--> Starting UI on http://localhost:5173 ..."
cd "$REPO_ROOT/ui"
npm run dev &
UI_PID=$!

sleep 1

echo ""
echo "==> Both servers running."
echo "    Game engine : http://localhost:3001"
echo "    UI          : http://localhost:5173"
echo ""
echo "Open http://localhost:5173 in your browser to play."
echo "Press Ctrl+C to stop."
echo ""

# Keep script alive until user interrupts
wait
