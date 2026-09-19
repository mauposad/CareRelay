#!/usr/bin/env bash
# Runs the CareRelay demo locally: API server + frontend, with the frontend
# proxying /api to the API server. On Replit the artifact router does this
# instead and this script is not needed.
#
# Usage: ./scripts/dev.sh      (Ctrl-C stops both)
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f .env ] && set -a && . ./.env && set +a

API_PORT="${API_PORT:-8788}"
WEB_PORT="${WEB_PORT:-5180}"

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

echo "==> Starting frontend on :$WEB_PORT (proxying /api -> :$API_PORT)"
PORT="$WEB_PORT" BASE_PATH=/ API_PORT="$API_PORT" pnpm --filter @workspace/care-relay run dev
