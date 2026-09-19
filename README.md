# CareRelay

**CareRelay** is a shared elder-care coordination app that turns family conversations and voice updates into structured, actionable care information.

> **One conversation in. The right care information out to every family member.**

Families often coordinate elder care across calls, texts, WhatsApp, iMessage, and memory. Important details can easily get buried, duplicated, or missed. CareRelay helps organize those updates into a shared care hub so each person sees the information and actions relevant to them.

---

## Core Idea

A family member can:

- Type a care update
- Paste or upload a message thread
- Record a voice update

CareRelay then converts that information into clearly attributed care events such as:

- Tasks
- Appointments
- Notes
- Reminders
- Follow-ups

The system preserves the source of each update and asks for confirmation before creating important reminders or actions.

---

## Main Features

### 1. Message Center

The Message Center provides a centralized place for family care communication.

It supports:

- Typed updates
- Pasted conversation threads
- Imported chat excerpts
- Care-relevant message extraction
- Source and sender attribution
- Proposed care-event cards for confirmation

CareRelay should identify useful care information while ignoring casual conversation.

**Example**

Input:

> “PT moved to Friday at 10. John can drive. Mom felt tired after breakfast.”

CareRelay can identify:

- Appointment: Physical therapy on Friday at 10:00
- Task: John will drive
- Note: Mom reported feeling tired
- Review flag: symptom note should be preserved without diagnosis

---

### 2. Voice-to-Text

A family member can record a voice update directly in the app.

Flow:

```text
Record voice update
    ↓
Speech-to-text transcription
    ↓
Care-relevance filtering
    ↓
AI event extraction
    ↓
Human confirmation
    ↓
Care timeline / task / reminder
```

The transcript should preserve important details such as names, dates, times, and confidence.

If the transcription is unclear or contains uncertain medication or symptom information, the app should request confirmation instead of silently creating an action.

---

### 3. AI Orchestration

CareRelay uses AI to turn unstructured updates into structured care events.

```text
Message / voice transcript
    ↓
Care relevance classifier
    ↓
Entity + event extraction
    ↓
Date/time normalization
    ↓
Person / owner matching
    ↓
Confidence + ambiguity checks
    ↓
Policy validation
    ↓
Proposed care events
```

The AI should extract:

- Person receiving care
- Task owner
- Appointment details
- Date and time
- Notes
- Reminder information
- Source evidence
- Confidence level

### Extraction Rules

1. Extract only care-relevant facts.
2. Never invent dates, diagnoses, medications, dosages, or instructions.
3. Leave missing owners or times unassigned.
4. Preserve the original wording and source evidence.
5. Treat medication changes or symptom concerns as review-required notes.
6. Require human confirmation before reminders or external notifications are created.

---

### 4. Care Tracker and Reminders

CareRelay converts confirmed updates into trackable care tasks.

Examples:

- Confirm morning medication
- Complete a 20-minute walk
- Call the clinic
- Attend a physical therapy appointment
- Complete a daily check-in
- Confirm transportation for an appointment

Typical reminder lifecycle:

```text
scheduled → due → notified → confirmed
                     ↓
                   snoozed
                     ↓
                    due

notified → missed → escalation
```

The reminder system should account for:

- Time zones
- Quiet hours
- Notification preferences
- Duplicate suppression
- Caregiver assignments
- Escalation rules

---

## Role-Specific Experiences

### Caregiver View

Caregivers can see:

- Shared care timeline
- Proposed AI events
- Assigned tasks
- Overdue items
- Appointment details
- Source evidence
- Confirm / reassign / snooze / complete actions

### Elder-Friendly View

The elder-facing experience should include:

- Large text
- High contrast
- Minimal navigation
- Today's next reminder
- Simple completion buttons
- Optional read-aloud or voice playback
- Only the information relevant to the person receiving care

### Care Manager / Admin View

Care managers can see:

- Multiple care profiles
- Support levels
- Care needs and tags
- Caregiver assignments
- Escalation chains
- Audit history
- Low-confidence or unresolved items

---

## High-Level Architecture

```text
                    ┌──────────────────────┐
                    │   Family Member UI   │
                    │ Text / Chat / Voice  │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Message Center    │
                    │  Input + Attribution │
                    └──────────┬───────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
        ┌─────────────────┐        ┌─────────────────┐
        │ Voice-to-Text   │        │ Text / Chat     │
        │ Transcription   │        │ Normalization   │
        └────────┬────────┘        └────────┬────────┘
                 │                          │
                 └────────────┬─────────────┘
                              ▼
                   ┌─────────────────────┐
                   │   AI Orchestration  │
                   │ Extract + Validate  │
                   └──────────┬──────────┘
                              ▼
                   ┌─────────────────────┐
                   │ Structured Care     │
                   │ Events + Tasks      │
                   └──────────┬──────────┘
                              ▼
             ┌────────────────────────────────┐
             │ Shared Care Hub / Timeline     │
             │ Tasks • Appointments • Notes  │
             └──────────────┬─────────────────┘
                            │
           ┌────────────────┼────────────────┐
           ▼                ▼                ▼
     Caregiver View    Elder View      Manager View
```

---

## Suggested Technical Stack

- **Frontend:** React / Next.js
- **Backend/API:** TypeScript
- **Database:** PostgreSQL
- **Validation:** Zod
- **Speech-to-Text:** STT provider
- **AI:** Structured-output LLM extraction endpoint
- **Notifications:** Web push, SMS, or email adapters
- **Realtime Updates:** WebSocket or Server-Sent Events
- **Storage:** Private object storage for audio and imports

---

## Minimum Care Event Model

```ts
type CareEvent = {
  type: "task" | "appointment" | "note" | "medication" | "exercise" | "check_in";
  summary: string;
  personId: string;
  ownerId?: string;
  datetime?: string;
  source: "voice" | "text" | "whatsapp" | "imessage" | "sms" | "email";
  status: "proposed" | "confirmed" | "open" | "done" | "cancelled";
  confidence?: number;
  evidence?: string;
};
```

---

## MVP

For the hackathon, the minimum working demo should support:

1. Paste or import a message thread.
2. Record a short voice note.
3. Transcribe voice to text.
4. Extract a task, appointment, owner, time, and note.
5. Display proposed care-event cards with source evidence.
6. Confirm an event into the shared care timeline.
7. Show caregiver and elder-friendly views.
8. Create a medication or exercise reminder.
9. Mark a task or reminder complete.
10. Include a preloaded backup demo dataset.

---

## Team Responsibilities

| Responsibility | Owner |
|---|---|
| Product / UX | Shuban |
| Backend | Teammate |
| Frontend | Harsh |
| Product Management | Mauricio |

The team should prioritize a reliable end-to-end workflow before adding stretch features.

---

## Running the Demo

```bash
pnpm install
./scripts/dev.sh
```

Then open http://localhost:5180 and sign in as `sarah@carerelay.demo` /
`carerelay-demo`.

Nothing else to install. With no `DATABASE_URL` the API runs an embedded
Postgres under `.data/`, applies migrations and seeds the demo circle on
startup. `./scripts/dev.sh --reset` wipes it for a clean run between demos.

Set `ANTHROPIC_API_KEY` in `.env` for live AI extraction. Without it the app
still runs end to end on deterministic demo data and labels each screen
"Demo extraction (no API key)".

---

## Demo Accounts

`./scripts/dev.sh` seeds the Wilson family care circle. All accounts use the
password `carerelay-demo`.

| Account | Role | What they see |
|---|---|---|
| `sarah@carerelay.demo` | Primary caregiver | Everything: import updates, confirm events, assign rides |
| `john@carerelay.demo` | Family support | Only his own tasks and the rides he is asked to drive |
| `margaret@carerelay.demo` | Care recipient | A simple daily plan |
| `patel@carerelay.demo` | Physician | Only explicitly shared observations — never rides or family logistics |
| `alex@carerelay.demo` | Family support | His own assignments |
| `emily@carerelay.demo` | Family | Her own assignments |

Visibility is enforced by the server, not hidden in the UI, so signing in as
each person genuinely shows a different care circle.


---

## Demo Flow

```text
Family member imports or speaks an update
                ↓
CareRelay extracts structured information
                ↓
Proposed care events appear
                ↓
Family member confirms the events
                ↓
Events are added to the shared care timeline
                ↓
Tasks and reminders are routed to the right people
                ↓
Each user sees a role-specific view
```

Example:

```text
"PT moved to Friday at 10. John can drive.
Mom felt tired after breakfast."
```

CareRelay proposes:

- Physical therapy appointment — Friday at 10:00
- John assigned to transportation
- Care note that Mom reported feeling tired
- Symptom note flagged for review without diagnosis

After confirmation:

- John sees: “Confirm PT ride”
- The elder sees: “Physical therapy — Friday at 10:00”
- The family timeline shows the original update and confirmed actions

---

## Safety and Trust

CareRelay is a coordination system, not a clinical decision-making system.

The app should:

- Preserve the source of every AI-generated item.
- Clearly distinguish proposed vs. confirmed information.
- Never diagnose symptoms.
- Never change medication names, dosages, or instructions.
- Never invent missing medical information.
- Require confirmation for important reminders and notifications.
- Encrypt sensitive message and audio data.
- Record consent and source provenance.
- Use role-based access control.
- Maintain an audit trail.
- Direct users to clinicians or emergency services for medical emergencies.

---

## Product Principle

**A group chat tells everyone everything. CareRelay tells each person what they need to know.**
