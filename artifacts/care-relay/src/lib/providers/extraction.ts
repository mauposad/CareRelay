import { CareEvent, MessageSource } from '../../types';
import {
  ApiExtractedEvent,
  ExtractionMode,
  extractDocument,
  extractText,
} from '../api';

export interface ExtractionResult {
  events: Partial<CareEvent>[];
  unresolved: string[];
  /** "ai" when Claude produced these events, "mock" when a deterministic fallback did. */
  mode: ExtractionMode;
  /** Set when the fallback ran because something failed, rather than because no key is configured. */
  fallbackReason?: string;
}

export interface ExtractionProvider {
  extractCareEvents(text: string, source: string): Promise<ExtractionResult>;
}

const CARE_PROFILE_ID = 'margaret';

/** API event shape -> the CareEvent fields the store expects. */
function toCareEvent(event: ApiExtractedEvent, source: string): Partial<CareEvent> {
  return {
    type: event.type,
    summary: event.summary,
    personId: CARE_PROFILE_ID,
    ...(event.ownerId ? { ownerId: event.ownerId } : {}),
    ...(event.datetime ? { datetime: event.datetime } : {}),
    source: source as MessageSource,
    status: 'proposed',
    confidence: event.confidence,
    evidence: event.evidence,
    needsConfirmation: true,
    unresolvedTime: event.unresolvedTime,
    ...(event.recurrence ? { recurrence: event.recurrence } : {}),
  };
}

/**
 * Last-resort fallback for when the API itself is unreachable (server not
 * running, offline laptop). The server has its own richer fallback; this one
 * only has to keep the on-stage demo alive.
 */
function offlineFallback(text: string, source: string): ExtractionResult {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');

  if (normalized === 'pt moved to friday at 10. john can drive. mom felt tired after breakfast.') {
    return {
      mode: 'mock',
      fallbackReason: 'Extraction service unreachable',
      events: [
        toCareEvent({
          type: 'appointment', summary: 'Physical therapy', ownerId: null, datetime: null,
          confidence: 0.94, evidence: 'PT moved to Friday at 10.', unresolvedTime: true, recurrence: null,
        }, source),
        toCareEvent({
          type: 'task', summary: 'Drive to Physical Therapy', ownerId: 'john', datetime: null,
          confidence: 0.91, evidence: 'John can drive.', unresolvedTime: true, recurrence: null,
        }, source),
        toCareEvent({
          type: 'symptom', summary: 'Reported feeling tired', ownerId: null, datetime: null,
          confidence: 0.85, evidence: 'Mom felt tired after breakfast.', unresolvedTime: false, recurrence: null,
        }, source),
      ],
      unresolved: [
        'Time of Friday PT needs explicit caregiver confirmation.',
        'Symptom note requires caregiver review; do not diagnose.',
      ],
    };
  }

  if (normalized === 'margaret does her stretching exercises every morning.') {
    return {
      mode: 'mock',
      fallbackReason: 'Extraction service unreachable',
      events: [
        toCareEvent({
          type: 'exercise', summary: 'Stretching exercises (Daily Morning)', ownerId: 'margaret',
          datetime: null, confidence: 0.88,
          evidence: 'Margaret does her stretching exercises every morning.',
          unresolvedTime: true, recurrence: 'daily',
        }, source),
      ],
      unresolved: ['Missing exact time for morning exercises.'],
    };
  }

  return {
    mode: 'mock',
    fallbackReason: 'Extraction service unreachable',
    events: [
      toCareEvent({
        type: 'note', summary: 'General update', ownerId: null, datetime: null,
        confidence: 0.6, evidence: text.substring(0, 100), unresolvedTime: false, recurrence: null,
      }, source),
    ],
    unresolved: ['Extraction service unreachable: update saved as a general note for reviewer confirmation.'],
  };
}

export const apiExtractionProvider: ExtractionProvider = {
  async extractCareEvents(text: string, source: string): Promise<ExtractionResult> {
    try {
      const result = await extractText(text, source);
      return {
        mode: result.mode,
        events: result.events.map((event) => toCareEvent(event, source)),
        unresolved: result.unresolved,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      };
    } catch (err) {
      console.warn('Extraction API unavailable, using offline fallback', err);
      return offlineFallback(text, source);
    }
  },
};

/** Uploaded care document -> proposed care events, same contract as text extraction. */
export async function extractCareEventsFromDocument(
  file: File,
): Promise<ExtractionResult & { documentName: string }> {
  try {
    const result = await extractDocument(file);
    return {
      mode: result.mode,
      events: result.events.map((event) => toCareEvent(event, 'internal')),
      unresolved: result.unresolved,
      documentName: result.documentName ?? file.name,
      ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
    };
  } catch (err) {
    console.warn('Document extraction API unavailable, using offline fallback', err);
    return { ...offlineFallback(`Care document: ${file.name}`, 'internal'), documentName: file.name };
  }
}
