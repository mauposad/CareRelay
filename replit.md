# CareRelay

CareRelay turns noisy family care updates and care documents into structured, role-specific information for caregivers, clinicians, and older adults.

## Run & Operate

- `./scripts/dev.sh` — run the whole demo locally (API server + frontend with an `/api` proxy)
- `pnpm --filter @workspace/api-server run dev` — API server alone (needs `PORT`)
- `pnpm --filter @workspace/care-relay run dev` — frontend alone (needs `PORT`, `BASE_PATH`, optional `API_PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/care-relay run test` — care logic unit tests
- `python3 scripts/src/make-sample-document.py` — regenerate the demo visit-summary PDF
- Env: `ANTHROPIC_API_KEY` enables live extraction (see `.env.example`). `DATABASE_URL` is only needed if the DB package is used.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- AI: Claude (`claude-opus-5`) via `@anthropic-ai/sdk`, strict tool-use for structured extraction
- DB: PostgreSQL + Drizzle ORM (scaffolded, not used by the demo)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Build: esbuild (API), Vite (frontend)

## Where things live

- `artifacts/api-server/src/lib/careExtraction.ts` — extraction prompt, tool schema, Claude calls, deterministic fallback
- `artifacts/api-server/src/routes/extract.ts` — `/api/extract`, `/api/extract/document`, `/api/extract/status`
- `artifacts/care-relay/src/lib/api.ts` — frontend client for the extraction API
- `artifacts/care-relay/src/lib/providers/extraction.ts` — API-backed provider + offline fallback, maps API events to `CareEvent`
- `artifacts/care-relay/src/pages/DocumentsPage.tsx` — document upload, review, and carry-forward
- `artifacts/care-relay/src/services/coreService.ts` — confirmation, task creation, recurrence, audit
- `artifacts/care-relay/src/types/index.ts` — normalized message, event, task, and care-profile contracts
- `artifacts/care-relay/src/lib/rbac.ts` — centralized roles, permissions, and event filtering
- `artifacts/care-relay/src/store/CareContext.tsx` — shared demo state and interactions
- `artifacts/care-relay/public/sample-visit-summary.pdf` — real PDF used by the demo's sample path

## Architecture decisions

- **One app, two intake paths.** Chat/voice text and uploaded documents run through the same extraction contract and land as `proposed` care events in one shared timeline. Document intake used to be a separate artifact; it is now the `/documents` route.
- **Three-layer extraction fallback.** Claude extracts when `ANTHROPIC_API_KEY` is set; the server falls back to deterministic demo events if the call fails; the client falls back again if the API is unreachable. The UI always states which mode produced the events, so the demo degrades visibly rather than silently.
- **Structured output via strict tool use.** Extraction uses a `strict: true` tool with a forced `tool_choice`, so event shape is guaranteed rather than parsed out of prose.
- **Documents get two review gates, not one.** The Documents page decides *which findings carry forward*; the dashboard decides *when and to whom*. Both are human steps — nothing from a document auto-schedules.
- **Role-based visibility stays centralized** in the RBAC module instead of being scattered across components.
- **Product copy treats symptoms as family-reported observations** and never presents diagnosis or medical advice. The extraction prompt enforces the same boundary.
- Frontend state is still local (localStorage); the API is stateless. Persistence is the natural next step.

## Product

- Import a family update (typed, pasted chat, or sample voice transcript) and watch it become structured care events with source evidence.
- Upload a visit summary or discharge note, review each extracted finding against its source quote, and carry approved ones into the shared record.
- Resolve missing times with a real date picker plus shortcuts inferred from the source ("in 2-4 weeks" offers "In 2 weeks" / "In 4 weeks").
- Confirm events to create assigned tasks; see them propagate into role-specific views.
- Switch among Care Owner, Primary Caregiver, Family Support, Family Viewer, Physician, and Elder demo roles.
- Demonstrate selective sharing and access rules through the Care Circle experience.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The frontend requires `PORT` and `BASE_PATH` env vars or Vite refuses to start. `scripts/dev.sh` sets both.
- `pnpm run typecheck:libs` must run before typechecking an individual artifact, or `tsc` reports TS6305 on the workspace libs.
- Extraction state (`lastExtraction.mode`) is what drives the AI/demo badge. If it reads "Demo extraction", check `/api/extract/status` before debugging the UI.
- Editing `CareContext.tsx` while the dev server is running can leave a stale HMR module ("useCareContext must be used within CareProvider"). Hard-reload the page.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
