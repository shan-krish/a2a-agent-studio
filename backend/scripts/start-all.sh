#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

echo "Starting self-contained A2A backend services..."

(cd "$ROOT/mcp-servers" && npm start) &
MCP_PID=$!

(cd "$ROOT/agents/card-replacement" && npm start) &
CARD_PID=$!

(cd "$ROOT/agents/charge-verification" && npm start) &
CHARGE_PID=$!

(cd "$ROOT/agents/ava" && npm start) &
AVA_PID=$!

(cd "$ROOT/agent-platform" && npm start) &
PLATFORM_PID=$!

cleanup() {
  echo "Stopping backend services..."
  kill "$MCP_PID" "$CARD_PID" "$CHARGE_PID" "$AVA_PID" "$PLATFORM_PID" 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait
