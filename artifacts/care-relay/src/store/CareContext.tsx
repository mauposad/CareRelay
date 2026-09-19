import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  CareState, CareEvent, CareTask, ClinicianQuestion, NormalizedMessage, MessageSource,
} from '../types';
import { ROLE, UserRole } from '../lib/rbac';
import {
  careApi, fetchExtractionStatus, extractDocument,
  type ExtractionStatus, type ExtractionMode,
  type ServerCareEvent, type ServerCareTask, type ServerRide, type CircleMember,
  type ApiExtractionResponse,
} from '../lib/api';
import { useAuth } from './AuthContext';

/**
 * Care state is server-owned. This provider is the single read/write path to
 * it, and deliberately exposes the same shape the dashboard components were
 * already written against (state.events / state.tasks / currentPersona) so the
 * role-specific views work unchanged on top of real, authorized data.
 */

/** Server circle roles -> the frontend's presentation roles. */
const ROLE_BY_CIRCLE_ROLE: Record<string, UserRole> = {
  primary_user: ROLE.ELDER,
  primary_caretaker: ROLE.PRIMARY_CAREGIVER,
  primary_physician: ROLE.PHYSICIAN,
  family: ROLE.FAMILY_SUPPORT,
};

const ROLE_TITLES: Record<string, string> = {
  primary_user: 'Care Recipient',
  primary_caretaker: 'Primary Caregiver',
  primary_physician: 'Primary Care Physician',
  family: 'Family Support',
};

export type Persona = { id: string; name: string; role: UserRole; title: string };

export type LastExtraction = {
  mode: ExtractionMode;
  unresolved: string[];
  fallbackReason?: string;
};

interface CareContextType {
  currentPersona: Persona;
  state: CareState;
  rides: ServerRide[];
  members: CircleMember[];

  // Care actions
  ingestMessage: (text: string, source: MessageSource) => Promise<void>;
  confirmEvent: (id: string, updates?: { datetime?: string; sharedWithPhysician?: boolean; needsRide?: boolean }) => Promise<void>;
  rejectEvent: (id: string) => Promise<void>;
  updateEventSharing: (id: string, shared: boolean) => Promise<void>;
  updateTaskStatus: (id: string, status: CareTask['status']) => Promise<void>;
  acceptTask: (id: string) => Promise<void>;
  reassignTask: (id: string, assignedTo: string | null) => Promise<void>;
  updateQuestionStatus: (id: string, status: ClinicianQuestion['status']) => void;

  // Ride logistics
  assignRide: (rideId: string, driverId: string) => Promise<void>;
  respondToRide: (rideId: string, accept: boolean, reason?: string) => Promise<void>;
  completeRide: (rideId: string) => Promise<void>;
  createRide: (body: Record<string, unknown>) => Promise<void>;

  // Documents
  extractDocumentFile: (file: File) => Promise<ApiExtractionResponse>;
  acceptDocumentEvents: (events: Partial<CareEvent>[], documentName: string) => Promise<number>;

  refresh: () => Promise<void>;
  isLoading: boolean;
  isProcessing: boolean;
  error: string | null;
  extractionStatus: ExtractionStatus | null;
  lastExtraction: LastExtraction | null;
}

const CareContext = createContext<CareContextType | null>(null);

/** Server event -> the CareEvent shape the dashboards render. */
function toCareEvent(event: ServerCareEvent): CareEvent {
  return {
    id: event.id,
    type: event.type,
    summary: event.summary,
    personId: 'margaret',
    ...(event.ownerId ? { ownerId: event.ownerId } : {}),
    ...(event.scheduledAt ? { datetime: event.scheduledAt } : {}),
    source: 'internal',
    status: event.status === 'proposed' ? 'proposed' : event.status === 'rejected' ? 'rejected' : 'confirmed',
    confidence: event.confidence,
    evidence: event.evidence,
    needsConfirmation: event.status === 'proposed',
    unresolvedTime: event.unresolvedTime,
    ...(event.recurrence ? { recurrence: event.recurrence } : {}),
    sharedWithPhysician: event.sharedWithPhysician,
    ...(event.messageId ? { messageId: event.messageId } : {}),
    ...(event.confirmedBy ? { confirmedBy: event.confirmedBy } : {}),
    ...(event.confirmedAt ? { approvalTime: event.confirmedAt } : {}),
  };
}

function toCareTask(task: ServerCareTask): CareTask {
  // The dashboards use a richer status vocabulary than the server stores.
  const status: CareTask['status'] =
    task.status === 'done' ? 'confirmed'
    : task.status === 'accepted' ? 'confirmed'
    : task.status === 'declined' ? 'unable'
    : task.status === 'cancelled' ? 'cancelled'
    : 'scheduled';

  return {
    id: task.id,
    careProfileId: 'margaret',
    category: (['medication', 'exercise', 'appointment', 'check_in', 'nutrition'].includes(task.category)
      ? task.category
      : 'other') as CareTask['category'],
    title: task.title,
    ...(task.assignedTo ? { assignedTo: task.assignedTo } : {}),
    ...(task.assigneeName ? { assigneeName: task.assigneeName } : {}),
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    status,
    confirmationRequired: true,
    ...(task.eventId ? { sourceEventId: task.eventId } : {}),
    ...(task.acceptedAt ? { acceptedAt: task.acceptedAt, acceptedBy: task.assignedTo ?? undefined } : {}),
    ...(task.recurrence ? { recurrence: task.recurrence } : {}),
  };
}

/**
 * The physician view is organised around questions from the family. We derive
 * them from the observations a caregiver explicitly chose to share, so the
 * view reflects real shared data rather than a separate fixture. Acknowledging
 * one is a local, session-only action.
 */
function deriveQuestions(events: CareEvent[]): ClinicianQuestion[] {
  return events
    .filter((event) => event.type === 'symptom' && event.status === 'confirmed' && event.sharedWithPhysician)
    .map((event) => ({
      id: `q_${event.id}`,
      timestamp: event.approvalTime ?? new Date().toISOString(),
      question: `A caregiver shared this observation for review: “${event.summary}”.`,
      askedBy: 'Care circle',
      status: 'awaiting_review' as const,
      sourceEventId: event.id,
    }));
}

function summarize(events: CareEvent[], tasks: CareTask[], rides: ServerRide[]): string {
  const observations = events.filter((e) => e.type === 'symptom' && e.status === 'confirmed').length;
  const openTasks = tasks.filter((t) => t.status === 'scheduled').length;
  const ridesNeedingDriver = rides.filter((r) => r.status === 'needs_driver').length;
  const parts = [
    `${observations} confirmed reported observation${observations === 1 ? '' : 's'}`,
    `${openTasks} open task${openTasks === 1 ? '' : 's'}`,
  ];
  if (ridesNeedingDriver > 0) {
    parts.push(`${ridesNeedingDriver} ride${ridesNeedingDriver === 1 ? '' : 's'} still needing a driver`);
  }
  return `Margaret has ${parts.join(', ')}.`;
}

export function CareProvider({ children }: { children: ReactNode }) {
  const { user, activeCircle } = useAuth();
  const circleId = activeCircle?.id ?? '';

  const [events, setEvents] = useState<CareEvent[]>([]);
  const [tasks, setTasks] = useState<CareTask[]>([]);
  const [rides, setRides] = useState<ServerRide[]>([]);
  const [members, setMembers] = useState<CircleMember[]>([]);
  const [messages, setMessages] = useState<NormalizedMessage[]>([]);
  const [acknowledged, setAcknowledged] = useState<Record<string, ClinicianQuestion['status']>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null);
  const [lastExtraction, setLastExtraction] = useState<LastExtraction | null>(null);

  const currentPersona: Persona = useMemo(() => ({
    id: user?.id ?? 'unknown',
    name: user?.displayName ?? 'Signed out',
    role: ROLE_BY_CIRCLE_ROLE[activeCircle?.role ?? 'family'] ?? ROLE.FAMILY_SUPPORT,
    title: ROLE_TITLES[activeCircle?.role ?? 'family'] ?? 'Family Support',
  }), [user, activeCircle]);

  const refresh = useCallback(async () => {
    if (!circleId) { setIsLoading(false); return; }
    setError(null);
    try {
      const [serverEvents, serverTasks, serverRides, serverMessages] = await Promise.all([
        careApi.listEvents(circleId),
        careApi.listTasks(circleId),
        careApi.listRides(circleId),
        careApi.listMessages(circleId),
      ]);
      setMessages(serverMessages.map((message) => ({
        id: message.id,
        familyId: 'fam_1',
        careProfileId: 'margaret',
        senderId: message.senderName ?? message.senderId ?? 'unknown',
        source: (message.source === 'document' ? 'internal' : message.source) as MessageSource,
        body: message.body,
        receivedAt: message.receivedAt,
        consent: 'user_imported',
      })));
      setEvents(serverEvents.map(toCareEvent));
      setTasks(serverTasks.map(toCareTask));
      setRides(serverRides);

      // Family members are not permitted to list the circle roster.
      try {
        setMembers(await careApi.listMembers(circleId));
      } catch {
        setMembers([]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load this care circle.');
    } finally {
      setIsLoading(false);
    }
  }, [circleId]);

  useEffect(() => { setIsLoading(true); void refresh(); }, [refresh]);

  useEffect(() => {
    let active = true;
    fetchExtractionStatus().then((status) => { if (active) setExtractionStatus(status); });
    return () => { active = false; };
  }, []);

  const ingestMessage = useCallback(async (text: string, source: MessageSource) => {
    if (!circleId || isProcessing) return;
    setIsProcessing(true);
    try {
      const result = await careApi.ingestMessage(circleId, text, source);
      setLastExtraction({
        mode: result.mode,
        unresolved: result.unresolved,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      });
      await refresh();
    } finally {
      setIsProcessing(false);
    }
  }, [circleId, isProcessing, refresh, user]);

  const confirmEvent = useCallback(async (
    id: string,
    updates?: { datetime?: string; sharedWithPhysician?: boolean; needsRide?: boolean },
  ) => {
    if (!circleId) return;
    await careApi.confirmEvent(circleId, id, {
      ...(updates?.datetime ? { scheduledAt: updates.datetime } : {}),
      ...(updates?.sharedWithPhysician !== undefined ? { sharedWithPhysician: updates.sharedWithPhysician } : {}),
      ...(updates?.needsRide ? { needsRide: true } : {}),
    });
    await refresh();
  }, [circleId, refresh]);

  const rejectEvent = useCallback(async (id: string) => {
    if (!circleId) return;
    await careApi.rejectEvent(circleId, id);
    await refresh();
  }, [circleId, refresh]);

  const updateEventSharing = useCallback(async (id: string, shared: boolean) => {
    if (!circleId) return;
    await careApi.shareEvent(circleId, id, shared);
    await refresh();
  }, [circleId, refresh]);

  const updateTaskStatus = useCallback(async (id: string, status: CareTask['status']) => {
    if (!circleId) return;
    // Map the dashboards' vocabulary back onto the server's.
    const serverStatus = status === 'confirmed' ? 'done'
      : status === 'unable' ? 'declined'
      : status === 'cancelled' ? 'cancelled'
      : 'scheduled';
    await careApi.updateTask(circleId, id, { status: serverStatus });
    await refresh();
  }, [circleId, refresh]);

  const acceptTask = useCallback(async (id: string) => {
    if (!circleId) return;
    await careApi.updateTask(circleId, id, { status: 'accepted' });
    await refresh();
  }, [circleId, refresh]);

  const reassignTask = useCallback(async (id: string, assignedTo: string | null) => {
    if (!circleId) return;
    await careApi.updateTask(circleId, id, { assignedTo, status: 'scheduled' });
    await refresh();
  }, [circleId, refresh]);

  const updateQuestionStatus = useCallback((id: string, status: ClinicianQuestion['status']) => {
    setAcknowledged((current) => ({ ...current, [id]: status }));
  }, []);

  const assignRide = useCallback(async (rideId: string, driverId: string) => {
    if (!circleId) return;
    await careApi.assignRide(circleId, rideId, driverId);
    await refresh();
  }, [circleId, refresh]);

  const respondToRide = useCallback(async (rideId: string, accept: boolean, reason?: string) => {
    if (!circleId) return;
    await careApi.respondToRide(circleId, rideId, accept, reason);
    await refresh();
  }, [circleId, refresh]);

  const completeRide = useCallback(async (rideId: string) => {
    if (!circleId) return;
    await careApi.completeRide(circleId, rideId);
    await refresh();
  }, [circleId, refresh]);

  const createRide = useCallback(async (body: Record<string, unknown>) => {
    if (!circleId) return;
    await careApi.createRide(circleId, body);
    await refresh();
  }, [circleId, refresh]);

  const extractDocumentFile = useCallback(async (file: File) => {
    setIsProcessing(true);
    try {
      const result = await extractDocument(file);
      setLastExtraction({
        mode: result.mode,
        unresolved: result.unresolved,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      });
      return result;
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const acceptDocumentEvents = useCallback(async (
    approved: Partial<CareEvent>[],
    documentName: string,
  ) => {
    if (!circleId || approved.length === 0) return 0;
    const payload = approved.map((event) => ({
      type: event.type,
      summary: event.summary,
      scheduledAt: event.datetime ?? null,
      confidence: event.confidence ?? 0.6,
      evidence: event.evidence ?? '',
      unresolvedTime: event.unresolvedTime ?? false,
      recurrence: event.recurrence ?? null,
    }));
    const result = await careApi.addEvents(circleId, payload, documentName, lastExtraction?.mode ?? 'manual');
    await refresh();
    return result.events.length;
  }, [circleId, refresh, lastExtraction]);

  const questions = useMemo(
    () => deriveQuestions(events).map((q) => ({ ...q, status: acknowledged[q.id] ?? q.status })),
    [events, acknowledged],
  );

  const state: CareState = useMemo(() => ({
    profile: {
      id: 'margaret',
      displayName: activeCircle?.recipientName ?? 'Margaret Wilson',
      supportLevel: 2,
      tags: ['medication', 'mobility', 'appointments'],
    },
    messages,
    events,
    tasks,
    questions,
    audit: [],
    summary: summarize(events, tasks, rides),
  }), [activeCircle, messages, events, tasks, questions, rides]);

  const value: CareContextType = {
    currentPersona, state, rides, members,
    ingestMessage, confirmEvent, rejectEvent, updateEventSharing,
    updateTaskStatus, acceptTask, reassignTask, updateQuestionStatus,
    assignRide, respondToRide, completeRide, createRide,
    extractDocumentFile, acceptDocumentEvents,
    refresh, isLoading, isProcessing, error, extractionStatus, lastExtraction,
  };

  return <CareContext.Provider value={value}>{children}</CareContext.Provider>;
}

export function useCareContext() {
  const ctx = useContext(CareContext);
  if (!ctx) throw new Error('useCareContext must be used within CareProvider');
  return ctx;
}
