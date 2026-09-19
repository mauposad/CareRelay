import { UserRole } from '../lib/rbac';

export type MessageSource = "whatsapp" | "imessage" | "sms" | "email" | "internal" | "voice";
export type ConsentStatus = "user_imported" | "webhook_consented" | "unknown";

export type NormalizedMessage = {
  id: string;
  familyId: string;
  careProfileId: string;
  senderId: string;
  source: MessageSource;
  body: string;
  receivedAt: string;
  consent: ConsentStatus;
};

export type CareEventStatus = "proposed" | "confirmed" | "rejected" | "open" | "done" | "cancelled";
export type CareEventType = "task" | "appointment" | "note" | "medication" | "exercise" | "check_in" | "symptom";

export type CareEvent = {
  id: string;
  type: CareEventType;
  summary: string;
  personId: string;
  ownerId?: string; // assigned to
  datetime?: string; // ISO string
  source: MessageSource;
  status: CareEventStatus;
  confidence: number;
  evidence: string;
  needsConfirmation: boolean;
  messageId?: string;
  unresolvedTime?: boolean; // explicitly tracks if time is missing/needs review
  recurrence?: string;
  sharedWithPhysician?: boolean;
  confirmedBy?: string; // actor ID who confirmed the event
  approvalTime?: string; // distinct from the reported/scheduled time
  relatedEventId?: string; // explicit linkage, e.g. a ride to its appointment
};

export type CareTaskStatus = "scheduled" | "due" | "confirmed" | "skipped" | "missed" | "cancelled" | "unable";

export type CareTask = {
  id: string;
  careProfileId: string;
  category: "medication" | "exercise" | "appointment" | "check_in" | "nutrition" | "other";
  title: string;
  instructions?: string;
  recurrence?: string; // e.g. "daily", "weekly"
  dueAt?: string;
  assignedTo?: string;
  /** Display name of the assignee, resolved by the server. */
  assigneeName?: string;
  status: CareTaskStatus;
  confirmationRequired: boolean;
  sourceEventId?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  relatedEventId?: string;
  nextOccurrenceTaskId?: string; // prevents another successor after status resets
};

export type TaskOccurrence = {
  id: string;
  taskId: string;
  dueAt: string;
  status: CareTaskStatus;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
};

export type CareProfileSupportLevel = 1 | 2 | 3 | 4;
export type CareProfileTag = "medication" | "mobility" | "exercise" | "nutrition" | "appointments" | "transportation" | "memory_support" | "daily_check_in";

export type CareProfile = {
  id: string;
  displayName: string;
  supportLevel: CareProfileSupportLevel;
  tags: CareProfileTag[];
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  details: string;
  source?: string;
};

// Legacy for Physician View
export interface ClinicianQuestion {
  id: string;
  timestamp: string;
  question: string;
  askedBy: string;
  status: 'awaiting_review' | 'acknowledged' | 'planned_discussion';
  sourceEventId: string;
}

export interface CareState {
  profile: CareProfile;
  messages: NormalizedMessage[];
  events: CareEvent[];
  tasks: CareTask[];
  questions: ClinicianQuestion[];
  audit: AuditEntry[];
  summary: string;
}
