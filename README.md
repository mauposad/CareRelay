# CareRelay

One conversation in. The right care information out to every family member.

CareRelay turns family chat updates, voice notes, and clinical documents into structured care events — then shows each person in the care circle only what they need to know.

## Quick start

**Authenticated branch:** This branch uses sign-in and server-backed care-circle roles. Run the managed API and CareRelay workflows with a configured PostgreSQL database. The demo flow below describes the imported `main` experience, not a replacement for authenticated authorization. See [replit.md](replit.md) for this branch's run instructions and integration boundaries.

```bash
pnpm install
./scripts/dev.sh
```

Open http://localhost:5180 and sign in as **sarah@carerelay.demo** / **carerelay-demo**.

No database to install and nothing to configure: with no `DATABASE_URL` the API
runs an embedded Postgres, migrates it, and seeds the Wilson family circle.
Add `ANTHROPIC_API_KEY` to `.env` for live AI extraction — without it the app
still runs end to end on deterministic demo data and labels every screen
"Demo extraction (no API key)". `./scripts/dev.sh --reset` gives you a clean
circle between demo runs.

### Demo accounts

All use the password `carerelay-demo`.

| Account | Role | Sees |
|---|---|---|
| `sarah@carerelay.demo` | Primary caregiver | Everything: ingest, confirm, assign rides |
| `john@carerelay.demo` | Family support | Only his own tasks and rides |
| `margaret@carerelay.demo` | Care recipient | A simple daily plan |
| `patel@carerelay.demo` | Physician | Only explicitly shared observations — no rides |
| `alex@carerelay.demo`, `emily@carerelay.demo` | Family | Their own assignments |

## The demo flow

1. **Pick a role** on the landing page (start with Sarah Wilson, Primary Caregiver).
2. **Paste an update** — "Try sample update" loads `PT moved to Friday at 10. John can drive. Mom felt tired after breakfast.` Extraction splits it into an appointment, an assigned task, and a reported observation, each with the quote it came from.
3. **Arrange the ride** — Friday's physical therapy has no driver. Ask John; sign in as John and accept, or decline with a reason and watch it return to the board so Sarah can hand it to Alex. The card keeps the whole chain.
4. **Or upload a document** — "Open document intake" → "Load sample visit summary" runs a real PDF through the same pipeline. Approve the findings you want to carry forward.
5. **Resolve and confirm** — missing times must be set by a person before an event becomes a task.
6. **Switch roles** — the physician sees only explicitly shared observations; John sees only his assigned logistics; Margaret sees a simple daily plan.

## Architecture

```
chat text / voice transcript ─┐
                              ├─→ POST /api/extract           ─┐
care document (PDF/JPG/PNG)  ─┴─→ POST /api/extract/document  ─┤
                                                               ├─→ Claude (strict tool use)
                                                               │   └─ fallback: deterministic demo events
                                                               ↓
                                            proposed CareEvents in the shared timeline
                                                               ↓
                                       human confirmation (time, owner, sharing)
                                                               ↓
                              tasks + rides + role-filtered views (RBAC)
                                                               ↓
                     ride needs a driver → offered → accepted / declined → handed off
```

- `artifacts/api-server` — Express API and the extraction service
- `artifacts/care-relay` — the React frontend (dashboard, document intake, role views)
- `lib/` — shared workspace packages (API spec, generated client, DB scaffolding)

See [replit.md](replit.md) for the full repo map, architecture decisions, and gotchas.

## Safety boundary

CareRelay coordinates reported information. It does not diagnose symptoms, change medications, or replace clinicians. The extraction prompt enforces this: observations are recorded as things a family member reported, never as findings, and the model is instructed never to invent dates, diagnoses, or medication instructions.
