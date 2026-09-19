# CareRelay

CareRelay turns noisy family care updates into structured, role-specific information for caregivers, clinicians, and older adults.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/care-relay run dev` — run the CareRelay frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/care-relay/src/types/index.ts` — normalized message, event, task, and care-profile contracts
- `artifacts/care-relay/src/lib/providers/` — mock extraction and transcription provider interfaces
- `artifacts/care-relay/src/components/` — family, physician, elder, Care Circle, and demo controls
- `artifacts/care-relay/src/index.css` — CareRelay visual tokens and global styles

## Architecture decisions

- The current build is frontend-only; mock data is isolated behind service functions for later backend replacement.
- Role-based visibility is centralized in the RBAC module instead of being scattered across components.
- Family, physician, and elder personas use distinct information architectures, not one dashboard with renamed navigation.
- Product copy treats symptoms as family-reported observations and never presents diagnosis or medical advice.

## Product

- Switch among Care Owner, Primary Caregiver, Family Support, Family Viewer, Physician, and Elder demo roles.
- Simulate a noisy family message being organized into relevant care events.
- Confirm assigned transportation and see the result propagate across role-specific views.
- Demonstrate selective sharing and access rules through the Care Circle experience.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
