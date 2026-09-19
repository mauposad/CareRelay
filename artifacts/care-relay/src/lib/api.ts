/**
 * Thin client for the CareRelay extraction API (artifacts/api-server).
 * Served from the same origin at /api in both dev (vite proxy) and production.
 */

export type ExtractionMode = 'ai' | 'mock';

export type ApiExtractedEvent = {
  type: 'task' | 'appointment' | 'note' | 'medication' | 'exercise' | 'check_in' | 'symptom';
  summary: string;
  ownerId: string | null;
  datetime: string | null;
  confidence: number;
  evidence: string;
  unresolvedTime: boolean;
  recurrence: string | null;
};

export type ApiExtractionResponse = {
  mode: ExtractionMode;
  events: ApiExtractedEvent[];
  unresolved: string[];
  fallbackReason?: string;
  documentName?: string;
};

export type ExtractionStatus = {
  aiEnabled: boolean;
  model: string;
};

const API_BASE = '/api';
const REQUEST_TIMEOUT_MS = 60000;

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // fall through to the status text
  }
  return `Request failed with status ${response.status}`;
}

/** Whether the server has live extraction credentials. Never throws. */
export async function fetchExtractionStatus(): Promise<ExtractionStatus> {
  try {
    const response = await withTimeout((signal) =>
      fetch(`${API_BASE}/extract/status`, { signal }),
    );
    if (!response.ok) return { aiEnabled: false, model: 'unavailable' };
    return (await response.json()) as ExtractionStatus;
  } catch {
    return { aiEnabled: false, model: 'unavailable' };
  }
}

export async function extractText(
  text: string,
  source: string,
): Promise<ApiExtractionResponse> {
  const response = await withTimeout((signal) =>
    fetch(`${API_BASE}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source }),
      signal,
    }),
  );
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ApiExtractionResponse;
}

export async function extractDocument(file: File): Promise<ApiExtractionResponse> {
  const form = new FormData();
  form.append('file', file);

  const response = await withTimeout((signal) =>
    fetch(`${API_BASE}/extract/document`, {
      method: 'POST',
      body: form,
      signal,
    }),
  );
  if (!response.ok) throw new Error(await readError(response));
  return (await response.json()) as ApiExtractionResponse;
}

/* ------------------------------------------------------------------ *
 * Care coordination + ride logistics.
 *
 * These endpoints are not in the generated OpenAPI client, so they are
 * hand-written here alongside the extraction calls. Cookies carry the
 * session, so every call sends credentials.
 * ------------------------------------------------------------------ */

export type ServerCareEvent = {
  id: string;
  type: 'task' | 'appointment' | 'note' | 'medication' | 'exercise' | 'check_in' | 'symptom';
  summary: string;
  ownerId: string | null;
  scheduledAt: string | null;
  status: 'proposed' | 'confirmed' | 'rejected';
  confidence: number;
  evidence: string;
  unresolvedTime: boolean;
  recurrence: string | null;
  sharedWithPhysician: boolean;
  extractionMode: ExtractionMode | 'manual';
  messageId: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export type ServerCareTask = {
  id: string;
  eventId: string | null;
  title: string;
  category: string;
  assignedTo: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  status: 'scheduled' | 'accepted' | 'done' | 'declined' | 'cancelled';
  recurrence: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
};

export type RideStatus = 'needs_driver' | 'offered' | 'accepted' | 'declined' | 'completed' | 'cancelled';

export type RideHistoryEntry = {
  id: string;
  action: string;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

export type ServerRide = {
  id: string;
  eventId: string | null;
  purpose: string;
  pickupAt: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  status: RideStatus;
  driverId: string | null;
  driverName: string | null;
  declineReason: string | null;
  notes: string | null;
  history: RideHistoryEntry[];
};

export type CircleMember = {
  userId: string;
  displayName: string;
  email: string;
  role: string;
};

export type IngestResponse = {
  mode: ExtractionMode;
  fallbackReason?: string;
  unresolved: string[];
  events: ServerCareEvent[];
};

async function callApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await withTimeout((signal) =>
    fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      signal,
      ...init,
    }),
  );
  if (!response.ok) throw new Error(await readError(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const careApi = {
  listEvents: (circleId: string) =>
    callApi<ServerCareEvent[]>(`/circles/${circleId}/events`),

  listTasks: (circleId: string) =>
    callApi<ServerCareTask[]>(`/circles/${circleId}/tasks`),

  listMessages: (circleId: string) =>
    callApi<{ id: string; source: string; body: string; receivedAt: string; senderId: string | null; senderName: string | null }[]>(
      `/circles/${circleId}/messages`,
    ),

  listRides: (circleId: string) =>
    callApi<ServerRide[]>(`/circles/${circleId}/rides`),

  listMembers: (circleId: string) =>
    callApi<CircleMember[]>(`/circles/${circleId}/members`),

  ingestMessage: (circleId: string, text: string, source: string) =>
    callApi<IngestResponse>(`/circles/${circleId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, source }),
    }),

  addEvents: (
    circleId: string,
    events: unknown[],
    sourceLabel: string,
    extractionMode: ExtractionMode | 'manual',
  ) =>
    callApi<{ events: ServerCareEvent[] }>(`/circles/${circleId}/events`, {
      method: 'POST',
      body: JSON.stringify({ events, sourceLabel, extractionMode }),
    }),

  confirmEvent: (
    circleId: string,
    eventId: string,
    body: { scheduledAt?: string | null; ownerId?: string | null; sharedWithPhysician?: boolean; needsRide?: boolean },
  ) =>
    callApi<{ event: ServerCareEvent }>(`/circles/${circleId}/events/${eventId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  rejectEvent: (circleId: string, eventId: string) =>
    callApi<ServerCareEvent>(`/circles/${circleId}/events/${eventId}/reject`, { method: 'POST' }),

  shareEvent: (circleId: string, eventId: string, shared: boolean) =>
    callApi<ServerCareEvent>(`/circles/${circleId}/events/${eventId}/share`, {
      method: 'POST',
      body: JSON.stringify({ shared }),
    }),

  updateTask: (
    circleId: string,
    taskId: string,
    body: { status?: string; assignedTo?: string | null },
  ) =>
    callApi<ServerCareTask>(`/circles/${circleId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createRide: (circleId: string, body: Record<string, unknown>) =>
    callApi<ServerRide>(`/circles/${circleId}/rides`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  assignRide: (circleId: string, rideId: string, driverId: string) =>
    callApi<ServerRide>(`/circles/${circleId}/rides/${rideId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ driverId }),
    }),

  respondToRide: (circleId: string, rideId: string, accept: boolean, reason?: string) =>
    callApi<ServerRide>(`/circles/${circleId}/rides/${rideId}/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept, reason }),
    }),

  completeRide: (circleId: string, rideId: string) =>
    callApi<ServerRide>(`/circles/${circleId}/rides/${rideId}/complete`, { method: 'POST' }),
};
