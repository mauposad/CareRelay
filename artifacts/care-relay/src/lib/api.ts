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
