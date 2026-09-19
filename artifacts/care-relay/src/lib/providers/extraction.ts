import { CareEvent } from '../../types';

export interface ExtractionResult {
  events: Partial<CareEvent>[];
  unresolved: string[];
}

export interface ExtractionProvider {
  extractCareEvents(text: string, source: string): Promise<ExtractionResult>;
}

export const mockExtractionProvider: ExtractionProvider = {
  async extractCareEvents(text: string, source: string): Promise<ExtractionResult> {
    // Artificial delay for realism
    await new Promise(resolve => setTimeout(resolve, 1500));

    const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ');

    // Deterministic Demo 1: "PT moved to Friday at 10. John can drive. Mom felt tired after breakfast."
    if (normalizedText === "pt moved to friday at 10. john can drive. mom felt tired after breakfast.") {
      return {
        events: [
          {
            type: "appointment",
            summary: "Physical therapy",
            personId: "margaret",
            datetime: undefined, // Requires explicit UI selection
            source: source as any,
            status: "proposed",
            confidence: 0.94,
            evidence: "PT moved to Friday at 10.",
            needsConfirmation: true,
            unresolvedTime: true
          },
          {
            type: "task",
            summary: "Drive to Physical Therapy",
            personId: "margaret",
            ownerId: "john",
            source: source as any,
            status: "proposed",
            confidence: 0.91,
            evidence: "John can drive.",
            needsConfirmation: true,
            unresolvedTime: true // Matches parent appointment
          },
          {
            type: "symptom", // Note mapping
            summary: "Reported feeling tired",
            personId: "margaret",
            source: source as any,
            status: "proposed",
            confidence: 0.85,
            evidence: "Mom felt tired after breakfast.",
            needsConfirmation: true
          }
        ],
        unresolved: ["Time of Friday PT needs explicit caregiver confirmation.", "Symptom note requires caregiver review; do not diagnose."]
      };
    }

    // Deterministic Demo 2: "Margaret does her stretching exercises every morning."
    if (normalizedText === "margaret does her stretching exercises every morning.") {
      return {
        events: [
          {
            type: "exercise",
            summary: "Stretching exercises (Daily Morning)",
            personId: "margaret",
            ownerId: "margaret",
            source: source as any,
            status: "proposed",
            confidence: 0.88,
            evidence: "Margaret does her stretching exercises every morning.",
            needsConfirmation: true,
            unresolvedTime: true, // Time is missing AM/PM exactness
            recurrence: "daily"
          }
        ],
        unresolved: ["Missing exact time for morning exercises."]
      };
    }

    // Fallback for arbitrary input
    return {
      events: [
        {
          type: "note",
          summary: "General update",
          personId: "margaret",
          source: source as any,
          status: "proposed",
          confidence: 0.60,
          evidence: text.substring(0, 100),
          needsConfirmation: true
        }
      ],
      unresolved: ["Unsupported demo extraction: arbitrary text treated as general note."]
    };
  }
};
