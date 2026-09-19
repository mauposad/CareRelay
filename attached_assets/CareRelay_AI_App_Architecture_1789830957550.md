# CareRelay — Draft AI App Architecture

## 1. Product definition

CareRelay is a shared elder-care coordination system. A family member can type, paste a message thread, or record a voice update. CareRelay converts the update into clearly attributed care events—tasks, appointments, notes, reminders, and follow-ups—then shows each participant only the information and actions relevant to their role.

The core product promise is:

> One conversation in. The right care information out to every family member.

This architecture follows the hackathon team's existing direction: universal chat import first, a shared care timeline, an elder-friendly view, role-based personalization, and a strict boundary that the system coordinates reported information rather than diagnosing, prescribing, or changing medication instructions. <replit-citation type="file" path="attached_assets/CareRelay_Hackathon_Team_Sheet_1789829247852.pdf" />

## 2. Recommended system shape

```text
┌────────────────────────────────────────────────────────────────────┐
│                         CLIENT EXPERIENCES                         │
│ Caregiver web/mobile │ Elder-friendly view │ Care manager console   │
│ Message center       │ Voice recorder      │ Reminders/check-ins    │
└───────────────┬───────────────────────────────┬────────────────────┘
                │ HTTPS/WebSocket                │ Push/SMS/email
                v                                ^
┌────────────────────────────────────────────────────────────────────┐
│                         APPLICATION API                            │
│ Auth/RBAC │ Families │ Care profiles │ Messages │ Events │ Tasks   │
│ Consent   │ Audit log │ Notification preferences │ Integrations    │
└───────┬───────────────┬───────────────┬───────────────┬────────────┘
        │               │               │               │
        v               v               v               v
┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐
│ Message       │ │ Voice         │ │ AI extraction │ │ Reminder    │
│ ingestion     │ │ pipeline      │ │ orchestrator  │ │ scheduler   │
│ + adapters    │ │ STT + quality  │ │ classify      │ │ + escalation│
└───────┬───────┘ └───────┬───────┘ │ extract       │ └──────┬──────┘
        │                 │          │ validate      │        │
        └─────────────────┴──────────┴───────────────┘        │
                             │                                │
                             v                                v
                  ┌───────────────────────┐       ┌──────────────────┐
                  │ Care coordination     │       │ Notification      │
                  │ service                │       │ service           │
                  │ events, plans, roles   │       │ push/SMS/email   │
                  └───────────┬───────────┘       └────────┬─────────┘
                              │                            │
                              v                            v
                  ┌───────────────────────┐       ┌──────────────────┐
                  │ Postgres              │       │ External systems  │
                  │ + audit/event history │       │ WhatsApp webhook  │
                  │ Object storage        │       │ iMessage share    │
                  │ Search index (later)  │       │ Calendar/SMS      │
                  └───────────────────────┘       └──────────────────┘
```

## 3. Main components

### A. Message center and integrations

The message center is both a chat-like internal workspace and an ingestion layer. Every imported or received message retains its source, sender, timestamp, consent status, and link to the family/care profile.

**MVP path**

1. User pastes or uploads a conversation excerpt.
2. The system stores the raw text as an import.
3. The AI pipeline identifies care-relevant statements and ignores casual conversation.
4. Extracted items appear as proposed cards for confirmation.

**Integration adapter interface**

```ts
interface MessageAdapter {
  source: "whatsapp" | "imessage" | "sms" | "email" | "internal";
  receive(input: RawMessage): Promise<NormalizedMessage[]>;
  send?(message: OutboundMessage): Promise<DeliveryReceipt>;
}
```

Each adapter should normalize into the same internal shape:

```ts
type NormalizedMessage = {
  id: string;
  familyId: string;
  careProfileId?: string;
  senderId?: string;
  source: MessageSource;
  body: string;
  receivedAt: string;
  externalId?: string;
  consent: "user_imported" | "webhook_consented" | "unknown";
};
```

**Integration strategy**

- **Universal import:** must-have demo path; works for WhatsApp, iMessage, SMS, or email text without requiring privileged access.
- **WhatsApp:** add a Meta webhook adapter when credentials and business setup are available.
- **iMessage:** support share-sheet/export/paste import; do not attempt unrestricted background access to a user's Messages database.
- **Outbound messages:** later add a notification/action adapter so a caregiver can be told, for example, “PT ride still needs confirmation.”

### B. Voice-to-text pipeline

```text
Record audio
  → upload encrypted audio
  → speech-to-text
  → transcript with timestamps/confidence
  → care-relevance filter
  → event extraction
  → human confirmation
  → care timeline/task/reminder
```

Store the transcript and optionally the original audio separately. The default should be transcript-first retention with configurable deletion of audio after transcription.

The voice pipeline should return:

```json
{
  "transcript": "Physical therapy moved to Friday at 10. John can drive.",
  "language": "en",
  "confidence": 0.94,
  "segments": [
    { "text": "Physical therapy moved to Friday at 10.", "startMs": 0, "endMs": 2800 }
  ],
  "needsReview": false
}
```

If transcription confidence is low, names/times conflict, or medication details are unclear, the system should ask for confirmation rather than silently creating a reminder.

### C. AI extraction orchestrator

Use one structured extraction endpoint rather than separate prompts scattered across the UI.

```text
normalized message/transcript
  → care relevance classifier
  → entity + event extraction
  → date/time normalization
  → person/owner matching
  → confidence + ambiguity checks
  → policy validator
  → proposed care events
```

The model should produce strict JSON validated against a server-side schema. It must preserve uncertainty:

```json
{
  "events": [
    {
      "type": "appointment",
      "summary": "Physical therapy",
      "person": "Margaret",
      "owner": "John",
      "datetime": "2026-09-25T10:00:00-04:00",
      "source": "voice",
      "status": "proposed",
      "confidence": 0.91,
      "evidence": "PT moved to Friday at 10. John can drive.",
      "needsConfirmation": false
    }
  ],
  "unresolved": []
}
```

**Non-negotiable extraction rules**

1. Extract only care-relevant facts.
2. Never invent a date, diagnosis, medication, dosage, or instruction.
3. If a person, owner, or time is missing, leave it unassigned/unknown.
4. Preserve the original wording and source evidence.
5. Treat medication changes and symptom concerns as review-required notes, not instructions.
6. Require a person to confirm any event that creates a reminder or external notification.

### D. Care profile and support-level categorization

Use the phrase **care support level** rather than presenting a model-generated “risk score” as a medical judgment. A family member or authorized care manager sets the initial level; AI may suggest tags, but it cannot silently reclassify someone.

#### Suggested support levels

| Level | Label | Typical coordination needs |
|---|---|---|
| 1 | Independent with reminders | Occasional appointments, medication/exercise reminders, low-frequency check-ins |
| 2 | Assisted at home | Regular check-ins, transportation, meal/help tasks, several recurring reminders |
| 3 | Coordinated care | Multiple caregivers, frequent tasks, appointments, adherence confirmations, escalation rules |
| 4 | High-touch support | Near-daily coordination, professional caregiver handoffs, missed-check-in escalation, more detailed audit trail |

These are workflow categories, not diagnoses. A profile also carries explicit needs and preferences:

```ts
type CareProfile = {
  id: string;
  displayName: string;
  supportLevel: 1 | 2 | 3 | 4;
  tags: Array<
    | "medication"
    | "mobility"
    | "exercise"
    | "nutrition"
    | "appointments"
    | "transportation"
    | "memory_support"
    | "daily_check_in"
  >;
  preferredChannels: ("push" | "sms" | "email" | "voice")[];
  quietHours?: { start: string; end: string; timezone: string };
  escalationPolicyId?: string;
};
```

### E. Tracker, recurring tasks, and reminders

Represent reminders as recurring care tasks, not as loose calendar notes.

```ts
type CareTask = {
  id: string;
  careProfileId: string;
  category: "medication" | "exercise" | "appointment" | "check_in" | "nutrition" | "other";
  title: string;
  instructions?: string;       // reported/confirmed text only
  recurrence?: RecurrenceRule;
  dueAt?: string;
  assignedTo?: string;
  status: "scheduled" | "due" | "confirmed" | "skipped" | "missed" | "cancelled";
  confirmationRequired: boolean;
  sourceEventId?: string;
};
```

Examples:

- “Confirm Margaret took the morning medication” at 8:00 AM.
- “20-minute walk” every weekday at 10:00 AM.
- “Call the clinic” on September 25 at 2:00 PM.
- “Daily check-in” at 7:00 PM, escalating to the backup caregiver after 60 minutes.

**Reminder lifecycle**

```text
scheduled → due → notified → confirmed
                     └────→ snoozed → due
                     └────→ missed → escalation policy
```

The reminder engine should respect timezone, quiet hours, channel preferences, and duplicate suppression. It should not send a medication-related reminder when the source data is ambiguous or unconfirmed.

## 4. Role-based experiences

### Caregiver view

- Shared timeline of recent updates.
- Proposed AI events awaiting confirmation.
- “My tasks” and overdue items.
- One-tap confirm, reassign, snooze, or mark unable to complete.
- Source evidence for every AI-created item.

### Elder-friendly view

- Large type, high contrast, minimal navigation.
- Today’s next reminder and simple completion buttons.
- Optional voice playback/read-aloud.
- No dense family chat unless explicitly enabled.

### Care manager/admin view

- Multiple care profiles.
- Support level and needs tags.
- Caregiver roster and escalation chain.
- Audit history and unresolved/low-confidence items.

The role switcher is useful for the demo, but production access should come from server-enforced permissions, not a client-side role toggle.

## 5. Data model

Core tables:

```text
users
families
family_members              user ↔ family, role, permissions
care_profiles               person receiving care
caregiver_assignments       user ↔ care profile, responsibility
message_threads
messages                    raw normalized messages
voice_records               audio metadata + transcript reference
care_events                 proposed/confirmed facts
care_tasks                  one-time or recurring action items
task_occurrences            each due instance and its status
reminders                   delivery attempts and preferences
escalation_policies
notifications
audit_log                   actor, action, before/after, source
```

The existing `care_event` concept maps directly to the new model:

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

## 6. API surface

```text
POST   /api/imports/messages
POST   /api/voice/transcriptions
POST   /api/ai/extract-care-events
GET    /api/care-profiles/:id/timeline
GET    /api/care-profiles/:id/tasks?status=due
POST   /api/care-events/:id/confirm
POST   /api/care-events/:id/reject
POST   /api/tasks/:id/complete
POST   /api/tasks/:id/snooze
POST   /api/webhooks/whatsapp
GET    /api/notifications
```

The write endpoints should be idempotent where an external message or webhook can be delivered more than once. Keep the raw source event ID so the system can trace every generated task back to the original message or transcript.

## 7. Suggested implementation stack

For a fast, credible build:

- **Frontend:** React/Next.js with a responsive caregiver dashboard and elder mode.
- **API:** TypeScript service with schema validation using Zod.
- **Database:** PostgreSQL with row-level family/care-profile authorization.
- **File storage:** private object storage for audio imports.
- **AI:** speech-to-text provider plus a structured-output LLM extraction endpoint.
- **Jobs:** database-backed job queue or scheduled worker for reminder occurrences.
- **Notifications:** web push first; SMS/email as adapters.
- **Realtime:** WebSocket or server-sent events for new care events and confirmations.
- **Observability:** structured logs, extraction confidence, reminder delivery status, and audit events.

Keep the AI provider behind `TranscriptionProvider` and `ExtractionProvider` interfaces so the app can switch models without changing care logic.

## 8. Hackathon MVP cut

### Must build

1. Paste/import a message thread.
2. Record a short voice note and transcribe it.
3. Extract one appointment, task, owner, time, and note.
4. Show proposed cards with evidence.
5. Confirm a card into the shared care timeline.
6. Show caregiver and elder-friendly views.
7. Create one medication or exercise reminder and mark it complete.
8. Seed a backup demo dataset.

### Defer

- Unrestricted iMessage database access.
- Full two-way WhatsApp messaging.
- Automated medication reconciliation.
- Clinical risk scoring or diagnosis.
- Complex caregiver billing, insurance, or EHR integrations.
- Vector search/RAG before the basic event pipeline is reliable.

## 9. Demo flow

```text
Sarah imports:
"PT moved to Friday at 10. John can drive.
Mom felt tired after breakfast."

→ AI identifies:
  - appointment: PT, Friday 10:00
  - task: John to drive Margaret
  - note: Margaret reported feeling tired
  - review flag: symptom note; do not diagnose

→ Sarah confirms:
  - PT ride task
  - Friday appointment

→ CareRelay shows:
  - John: "Confirm PT ride for Margaret"
  - Margaret: "Physical therapy — Friday at 10:00"
  - family timeline: the original note and confirmed actions

→ A second voice note:
"Margaret does her stretching exercises every morning."

→ CareRelay proposes:
  - recurring exercise task, daily morning
  - caregiver confirmation required
```

## 10. Safety and trust requirements

- Every AI-generated item displays source evidence and whether it is proposed or confirmed.
- Never allow AI to alter medication names, dosage, or clinical instructions.
- Do not infer a diagnosis from “felt tired,” a missed task, or a message.
- Use least-privilege family roles and server-side authorization.
- Encrypt audio and message imports in transit and at rest.
- Record consent and source provenance for imported messages.
- Provide deletion/export controls for a family’s data.
- Escalations must be configurable and clearly labeled as workflow notifications, not emergency services.
- For emergencies, show a clear instruction to contact local emergency services or the person’s clinician; do not make the app the sole safety channel.
