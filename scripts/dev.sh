#!/usr/bin/env bash
# Runs the whole CareRelay demo locally: API + frontend, with the frontend
# proxying /api to the API server.
#
# Needs no database. With no DATABASE_URL the API uses an embedded Postgres
# (PGlite) under .data/, migrates it, and seeds the Wilson family demo.
#
# Usage: ./scripts/dev.sh            (Ctrl-C stops both)
#        ./scripts/dev.sh --reset    (wipe the demo database first)
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

API_PORT="${API_PORT:-8788}"
WEB_PORT="${WEB_PORT:-5180}"
export SEED_DEMO="${SEED_DEMO:-true}"

if [ "${1:-}" = "--reset" ]; then
  echo "==> Resetting the demo database"
  rm -rf .data
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  echo "! ANTHROPIC_API_KEY is not set — extraction will use demo fallback data."
  echo "  Set it in .env (see .env.example) for live extraction."
fi

echo "==> Building shared libraries"
pnpm run typecheck:libs

echo "==> Starting API server on :$API_PORT"
PORT="$API_PORT" pnpm --filter @workspace/api-server run dev &
API_PID=$!

cleanup() { kill "$API_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

cat <<'ACCOUNTS'

==> Demo accounts (password: carerelay-demo)
    sarah@carerelay.demo      Primary caregiver  — ingest, confirm, assign rides
    john@carerelay.demo       Family support     — sees only his tasks and rides
    margaret@carerelay.demo   Care recipient     — simple daily plan
    patel@carerelay.demo      Physician          — shared observations only
    alex@carerelay.demo       Family support
    emily@carerelay.demo      Family

ACCOUNTS

echo "==> Starting frontend on :$WEB_PORT (proxying /api -> :$API_PORT)"
PORT="$WEB_PORT" BASE_PATH=/ API_PORT="$API_PORT" pnpm --filter @workspace/care-relay run dev
