# CareRelay

CareRelay coordinates family care updates with authenticated care-circle membership and server-enforced roles.

## Run & Operate

- Install with `pnpm install --frozen-lockfile`.
- Use the managed `artifacts/care-relay: web` and `artifacts/api-server: API Server` workflows.
- `pnpm run typecheck` checks the workspace.
- `pnpm --filter @workspace/api-server test` runs backend authorization tests.
- Frontend Vite commands require `PORT` and `BASE_PATH`; managed workflows provide them.
- PostgreSQL (`DATABASE_URL`) is required by the authenticated API. Do not invent credentials or automatically seed/reset user data.
- Extraction optionally uses `ANTHROPIC_API_KEY`; without it, the imported extraction service returns labeled deterministic demo results.

## Merge boundaries

- Preserve the authenticated branch's session, care-circle membership, approval, audit, and role-management paths.
- Do not replace server authorization with the main branch's demo persona switcher or localStorage care state.
- Main also contains document intake, extraction providers, and legacy demo components. Importing those files does not make local demo state part of the authenticated care record.
- Extraction routes require an authenticated session.
- CareRelay coordinates reported information; it does not diagnose, prescribe, or replace emergency services.

## Source map

- `artifacts/api-server/src/routes/` — authentication, care circles, approvals, membership, audit, and extraction
- `artifacts/care-relay/src/store/AuthContext.tsx` — authenticated client state
- `artifacts/care-relay/src/store/CareContext.tsx` — legacy demo state, not server-authoritative
- `artifacts/care-relay/src/pages/DocumentsPage.tsx` — imported document intake
- `lib/db/src/schema/` — persisted schema