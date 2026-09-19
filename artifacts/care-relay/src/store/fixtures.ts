import { CareEvent, CareProfile, CareTask, ClinicianQuestion, NormalizedMessage, AuditEntry } from '../types';
import { createNYDateISO } from '../lib/dateUtils';

export const INITIAL_PROFILE: CareProfile = {
  id: "margaret",
  displayName: "Margaret Wilson",
  supportLevel: 2, // Assisted at home
  tags: ["medication", "mobility", "appointments"]
};

export const INITIAL_MESSAGES: NormalizedMessage[] = [
  {
    id: "msg_old_1",
    familyId: "fam_1",
    careProfileId: "margaret",
    senderId: "sarah",
    source: "whatsapp",
    body: "Margaret mentioned feeling dizzy after breakfast yesterday.",
    receivedAt: createNYDateISO(-3, 9),
    consent: "user_imported"
  }
];

export const INITIAL_EVENTS: CareEvent[] = [
  {
    id: "evt_old_1",
    type: "symptom",
    summary: "Reported dizzy after breakfast.",
    personId: "margaret",
    source: "whatsapp",
    status: "confirmed",
    confidence: 1.0,
    evidence: "Margaret mentioned feeling dizzy after breakfast yesterday.",
    needsConfirmation: false,
    messageId: "msg_old_1",
    datetime: createNYDateISO(-3, 9),
    sharedWithPhysician: true,
  }
];

export const INITIAL_TASKS: CareTask[] = [];

export const INITIAL_QUESTIONS: ClinicianQuestion[] = [
  {
    id: "q_1",
    timestamp: createNYDateISO(-1, 11),
    question: "Margaret has mentioned dizziness once this week. Is this something we should discuss at the next appointment?",
    askedBy: "Alex Wilson",
    status: "awaiting_review",
    sourceEventId: "evt_old_1",
  }
];

export const INITIAL_AUDIT: AuditEntry[] = [
  {
    id: "audit_1",
    timestamp: createNYDateISO(-3, 9),
    actorId: "sarah",
    action: "imported_message",
    details: "Imported symptom report from WhatsApp",
    source: "whatsapp"
  }
];

export const INITIAL_SUMMARY = "One confirmed family-reported observation is on record.";
