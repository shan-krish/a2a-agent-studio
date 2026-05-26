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
  echo "== TypeScript check: ${dir#$ROOT/} =="
  (cd "$dir" && npx tsc --noEmit --skipLibCheck)
done
