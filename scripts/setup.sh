#!/usr/bin/env bash
# setup.sh — Install all dependencies for Padik on macOS.
# Requires: macOS with Homebrew (https://brew.sh)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Padik setup"
echo ""

# ── Node.js ──────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "--> Node.js not found. Installing via Homebrew..."
  if ! command -v brew &>/dev/null; then
    echo "ERROR: Homebrew is required. Install it from https://brew.sh and re-run."
    exit 1
  fi
  brew install node
else
  echo "--> Node.js $(node --version) found."
fi

# ── Engine dependencies ───────────────────────────────────────────────────────
echo ""
echo "--> Installing engine dependencies..."
cd "$REPO_ROOT/engine"
npm install

# ── UI dependencies ───────────────────────────────────────────────────────────
echo ""
echo "--> Installing UI dependencies..."
cd "$REPO_ROOT/ui"
npm install

echo ""
echo "==> Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Launch LM Studio and load a model."
echo "     Make sure the local server is running on http://localhost:1234"
echo "     (LM Studio → Local Server tab → Start Server)"
echo ""
echo "  2. Start the game:"
echo "     bash scripts/start.sh"
echo ""
echo "  3. Open http://localhost:5173 in your browser."
