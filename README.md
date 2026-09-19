# CareRelay

One conversation in. The right care information out to every family member.

CareRelay turns family chat updates, voice notes, and clinical documents into structured care events — then shows each person in the care circle only what they need to know.

## Quick start

**Authenticated branch:** This branch uses sign-in and server-backed care-circle roles. Run the managed API and CareRelay workflows with a configured PostgreSQL database. The demo flow below describes the imported `main` experience, not a replacement for authenticated authorization. See [replit.md](replit.md) for this branch's run instructions and integration boundaries.

```bash
pnpm install
cp .env.example .env     # add ANTHROPIC_API_KEY for live extraction (optional)
./scripts/dev.sh
```

Open http://localhost:5180.

Without an API key the app still runs end to end using deterministic demo data, and every screen labels itself "Demo extraction (no API key)".

## The demo flow

1. **Pick a role** on the landing page (start with Sarah Wilson, Primary Caregiver).
2. **Paste an update** — "Try sample update" loads `PT moved to Friday at 10. John can drive. Mom felt tired after breakfast.` Extraction splits it into an appointment, an assigned task, and a reported observation, each with the quote it came from.
3. **Or upload a document** — "Open document intake" → "Load sample visit summary" runs a real PDF through the same pipeline. Approve the findings you want to carry forward.
4. **Resolve and confirm** — missing times must be set by a person before an event becomes a task.
5. **Switch roles** — the physician sees only explicitly shared observations; John sees only his assigned logistics; Margaret sees a simple daily plan.

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
                                     tasks + role-filtered views (RBAC)
```

- `artifacts/api-server` — Express API and the extraction service
- `artifacts/care-relay` — the React frontend (dashboard, document intake, role views)
- `lib/` — shared workspace packages (API spec, generated client, DB scaffolding)

See [replit.md](replit.md) for the full repo map, architecture decisions, and gotchas.

## Safety boundary

CareRelay coordinates reported information. It does not diagnose symptoms, change medications, or replace clinicians. The extraction prompt enforces this: observations are recorded as things a family member reported, never as findings, and the model is instructed never to invent dates, diagnoses, or medication instructions.
