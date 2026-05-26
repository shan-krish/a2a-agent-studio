#!/usr/bin/env sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

for dir in \
  "$ROOT/agents/ava" \
  "$ROOT/agents/charge-verification" \
  "$ROOT/agents/card-replacement" \
  "$ROOT/mcp-servers" \
  "$ROOT/agent-platform"
do
  echo "== npm install: ${dir#$ROOT/} =="
  (cd "$dir" && npm install)
done
