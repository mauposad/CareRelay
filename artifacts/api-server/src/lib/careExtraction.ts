import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger";

/**
 * Shared contract between the extraction service and the CareRelay frontend.
 * Mirrors `artifacts/care-relay/src/types/index.ts` (CareEvent), minus the
 * fields the client owns (id, status, messageId).
 */
export type ExtractedEventType =
  | "task"
  | "appointment"
  | "note"
  | "medication"
  | "exercise"
  | "check_in"
  | "symptom";

export type ExtractedEvent = {
  type: ExtractedEventType;
  summary: string;
  ownerId: string | null;
  datetime: string | null;
  confidence: number;
  evidence: string;
  unresolvedTime: boolean;
  recurrence: string | null;
};

export type ExtractionResult = {
  /** "ai" when Claude produced the events, "mock" when the deterministic demo fallback did. */
  mode: "ai" | "mock";
  events: ExtractedEvent[];
  unresolved: string[];
  /** Populated when mode is "mock" and the fallback was triggered by a failure rather than a missing key. */
  fallbackReason?: string;
};

export const CARE_MODEL = "claude-opus-5";

/** Persona ids the extractor may assign work to. Kept in sync with lib/rbac.ts. */
const KNOWN_OWNERS = ["sarah", "john", "alex", "emily", "margaret"] as const;

const SYSTEM_PROMPT = `You are the extraction engine for CareRelay, a shared elder-care coordination tool for one family.

The care recipient is Margaret Wilson ("Mom", "Margaret", "Grandma"). The care circle:
- sarah — Sarah Wilson, primary caregiver (daughter)
- john — John Wilson, family support (son)
- alex — Alex Wilson, care owner (son)
- emily — Emily Wilson, family viewer (granddaughter)
- margaret — Margaret Wilson, the care recipient herself

Your job: read a family message, chat excerpt, voice transcript, or care document and return ONLY the care-relevant facts as structured events. Casual conversation, greetings, jokes and logistics unrelated to Margaret's care are ignored entirely.

EXTRACTION RULES — these are hard constraints:
1. Extract only care-relevant facts. If nothing in the input is care-relevant, return an empty events array.
2. Preserve uncertainty as reported notes. Report what a person said, never conclude what is true.
3. NEVER invent dates, diagnoses, dosages or medication instructions. Only record what the source states.
4. If the owner or the time is missing or ambiguous, leave it unassigned/null rather than guessing.
5. Symptoms are family-reported observations, not diagnoses. Phrase them as reports ("Reported feeling dizzy"), never as findings.
6. Every event must carry an "evidence" string quoted verbatim from the source. Do not paraphrase evidence.

EVENT TYPES:
- appointment — a scheduled or rescheduled visit (PT, doctor, lab)
- task — something a person must do (drive, pick up a prescription, call the office)
- medication — a medication instruction reported in the source
- exercise — a recurring physical routine
- check_in — a wellbeing check someone should perform
- symptom — a reported observation about how Margaret felt
- note — care-relevant context that fits none of the above

TIME HANDLING:
- Set "datetime" ONLY when the source gives an unambiguous absolute date and time.
- "Friday at 10" is ambiguous (which Friday? AM or PM?) — leave datetime null and set unresolvedTime true.
- "every morning" is a recurrence without an exact time — set recurrence "daily", datetime null, unresolvedTime true.
- When there is no time dimension at all (e.g. a reported symptom), datetime null and unresolvedTime false.

OWNERSHIP:
- Set ownerId only when the source names who is responsible. "John can drive" → ownerId "john".
- Otherwise null (unassigned). Never assume the sender is the owner.

CONFIDENCE: 0.0–1.0, how certain you are this is a real, correctly-typed care fact.

UNRESOLVED: a list of short, human-readable notes about what a caregiver still needs to decide or confirm. Every event with unresolvedTime true should have a corresponding note. Flag anything clinical that needs human review.`;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_care_events",
  description:
    "Record the care-relevant events extracted from the source, plus anything a caregiver still needs to resolve.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      events: {
        type: "array",
        description:
          "Care-relevant events found in the source. Empty if the source contains nothing care-relevant.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "task",
                "appointment",
                "note",
                "medication",
                "exercise",
                "check_in",
                "symptom",
              ],
            },
            summary: {
              type: "string",
              description:
                "Short imperative or descriptive phrase, e.g. 'Physical therapy' or 'Drive to physical therapy'.",
            },
            ownerId: {
              type: ["string", "null"],
              enum: [...KNOWN_OWNERS, null],
              description: "Persona id responsible, or null when unassigned.",
            },
            datetime: {
              type: ["string", "null"],
              description:
                "ISO 8601 timestamp, only when the source is unambiguous. Otherwise null.",
            },
            confidence: {
              type: "number",
              description: "0.0 to 1.0.",
            },
            evidence: {
              type: "string",
              description: "Verbatim quote from the source supporting this event.",
            },
            unresolvedTime: {
              type: "boolean",
              description:
                "True when a time is implied but not pinned down, so a caregiver must confirm it.",
            },
            recurrence: {
              type: ["string", "null"],
              description: "e.g. 'daily' or 'weekly', or null for one-off events.",
            },
          },
          required: [
            "type",
            "summary",
            "ownerId",
            "datetime",
            "confidence",
            "evidence",
            "unresolvedTime",
            "recurrence",
          ],
          additionalProperties: false,
        },
      },
      unresolved: {
        type: "array",
        description:
          "Short notes about what a caregiver still needs to confirm or decide.",
        items: { type: "string" },
      },
    },
    required: ["events", "unresolved"],
    additionalProperties: false,
  },
};

let cachedClient: Anthropic | null | undefined;

/** Returns a client, or null when no credentials are configured. */
function getClient(): Anthropic | null {
  if (cachedClient !== undefined) return cachedClient;
  if (!process.env["ANTHROPIC_API_KEY"] && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
    cachedClient = null;
    logger.warn(
      "No ANTHROPIC_API_KEY set — CareRelay extraction will use the deterministic demo fallback.",
    );
  } else {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

export function isAiEnabled(): boolean {
  return getClient() !== null;
}

function coerceEvents(raw: unknown): { events: ExtractedEvent[]; unresolved: string[] } {
  const input = raw as { events?: unknown[]; unresolved?: unknown[] };
  const events: ExtractedEvent[] = (input.events ?? [])
    .map((item) => item as Record<string, unknown>)
    .filter((item) => typeof item["summary"] === "string" && item["summary"])
    .map((item) => {
      const owner = item["ownerId"];
      return {
        type: (item["type"] as ExtractedEventType) ?? "note",
        summary: String(item["summary"]),
        ownerId:
          typeof owner === "string" &&
          (KNOWN_OWNERS as readonly string[]).includes(owner)
            ? owner
            : null,
        datetime: typeof item["datetime"] === "string" ? item["datetime"] : null,
        confidence:
          typeof item["confidence"] === "number"
            ? Math.max(0, Math.min(1, item["confidence"]))
            : 0.6,
        evidence: typeof item["evidence"] === "string" ? item["evidence"] : "",
        unresolvedTime: item["unresolvedTime"] === true,
        recurrence:
          typeof item["recurrence"] === "string" ? item["recurrence"] : null,
      };
    });

  const unresolved: string[] = (input.unresolved ?? [])
    .filter((note): note is string => typeof note === "string" && note.length > 0);

  return { events, unresolved };
}

async function runExtraction(
  content: Anthropic.ContentBlockParam[],
): Promise<{ events: ExtractedEvent[]; unresolved: string[] }> {
  const client = getClient();
  if (!client) throw new Error("No Anthropic credentials configured");

  const response = await client.messages.create({
    model: CARE_MODEL,
    max_tokens: 8000,
    // Extraction is a bounded, well-specified task — low effort keeps the
    // live demo responsive without hurting accuracy.
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "record_care_events" },
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Extraction refused: ${response.stop_details?.explanation ?? "no explanation"}`,
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) throw new Error("Model returned no structured extraction");

  return coerceEvents(toolUse.input);
}

/** Extract care events from a chat excerpt, typed update or voice transcript. */
export async function extractFromText(
  text: string,
  source: string,
): Promise<ExtractionResult> {
  if (!isAiEnabled()) {
    return { ...mockExtract(text), mode: "mock" };
  }

  try {
    const result = await runExtraction([
      {
        type: "text",
        text: `Source channel: ${source}\nToday is ${new Date().toISOString().slice(0, 10)}.\n\nFamily update to extract:\n"""\n${text}\n"""`,
      },
    ]);
    return { ...result, mode: "ai" };
  } catch (err) {
    logger.error({ err }, "AI extraction failed; falling back to demo extraction");
    return {
      ...mockExtract(text),
      mode: "mock",
      fallbackReason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Extract care events from an uploaded care document (PDF or image). */
export async function extractFromDocument(
  file: { buffer: Buffer; mimetype: string; originalname: string },
): Promise<ExtractionResult> {
  if (!isAiEnabled()) {
    return { ...mockDocumentExtract(file.originalname), mode: "mock" };
  }

  const data = file.buffer.toString("base64");
  const isPdf = file.mimetype === "application/pdf";

  const sourceBlock: Anthropic.ContentBlockParam = isPdf
    ? {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data },
      }
    : {
        type: "image",
        source: {
          type: "base64",
          media_type: file.mimetype as "image/jpeg" | "image/png",
          data,
        },
      };

  try {
    const result = await runExtraction([
      sourceBlock,
      {
        type: "text",
        text: `Source channel: document\nDocument filename: ${file.originalname}\nToday is ${new Date().toISOString().slice(0, 10)}.\n\nThis is a care document (visit summary, discharge note, or similar) for Margaret Wilson. Extract the care-relevant instructions and observations a family caregiver would need to act on. Quote the document verbatim in each evidence field. Do not infer a diagnosis and do not restate medication instructions beyond what the document says.`,
      },
    ]);
    return { ...result, mode: "ai" };
  } catch (err) {
    logger.error({ err }, "AI document extraction failed; falling back to demo extraction");
    return {
      ...mockDocumentExtract(file.originalname),
      mode: "mock",
      fallbackReason: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Deterministic fallback — keeps the demo working with no API key and
 * when a live call fails mid-demo.
 * ------------------------------------------------------------------ */

export function mockExtract(text: string): { events: ExtractedEvent[]; unresolved: string[] } {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");

  if (
    normalized ===
    "pt moved to friday at 10. john can drive. mom felt tired after breakfast."
  ) {
    return {
      events: [
        {
          type: "appointment",
          summary: "Physical therapy",
          ownerId: null,
          datetime: null,
          confidence: 0.94,
          evidence: "PT moved to Friday at 10.",
          unresolvedTime: true,
          recurrence: null,
        },
        {
          type: "task",
          summary: "Drive to Physical Therapy",
          ownerId: "john",
          datetime: null,
          confidence: 0.91,
          evidence: "John can drive.",
          unresolvedTime: true,
          recurrence: null,
        },
        {
          type: "symptom",
          summary: "Reported feeling tired",
          ownerId: null,
          datetime: null,
          confidence: 0.85,
          evidence: "Mom felt tired after breakfast.",
          unresolvedTime: false,
          recurrence: null,
        },
      ],
      unresolved: [
        "Time of Friday PT needs explicit caregiver confirmation.",
        "Symptom note requires caregiver review; do not diagnose.",
      ],
    };
  }

  if (normalized === "margaret does her stretching exercises every morning.") {
    return {
      events: [
        {
          type: "exercise",
          summary: "Stretching exercises (Daily Morning)",
          ownerId: "margaret",
          datetime: null,
          confidence: 0.88,
          evidence: "Margaret does her stretching exercises every morning.",
          unresolvedTime: true,
          recurrence: "daily",
        },
      ],
      unresolved: ["Missing exact time for morning exercises."],
    };
  }

  return {
    events: [
      {
        type: "note",
        summary: "General update",
        ownerId: null,
        datetime: null,
        confidence: 0.6,
        evidence: text.substring(0, 100),
        unresolvedTime: false,
        recurrence: null,
      },
    ],
    unresolved: [
      "Demo fallback active: arbitrary text is recorded as a general note for reviewer confirmation.",
    ],
  };
}

export function mockDocumentExtract(
  documentName: string,
): { events: ExtractedEvent[]; unresolved: string[] } {
  return {
    events: [
      {
        type: "medication",
        summary: "Continue lisinopril 10 mg once daily",
        ownerId: "sarah",
        datetime: null,
        confidence: 0.92,
        evidence: "Continue lisinopril 10 mg once daily.",
        unresolvedTime: false,
        recurrence: "daily",
      },
      {
        type: "symptom",
        summary: "Reported occasional dizziness when standing",
        ownerId: null,
        datetime: null,
        confidence: 0.89,
        evidence: "Patient reports occasional dizziness when standing.",
        unresolvedTime: false,
        recurrence: null,
      },
      {
        type: "appointment",
        summary: "Primary care follow-up",
        ownerId: null,
        datetime: null,
        confidence: 0.87,
        evidence: "Follow up with primary care in 2-4 weeks.",
        unresolvedTime: true,
        recurrence: null,
      },
      {
        type: "note",
        summary: "Encourage hydration and standing slowly",
        ownerId: "sarah",
        datetime: null,
        confidence: 0.83,
        evidence: "Encourage hydration and standing slowly.",
        unresolvedTime: false,
        recurrence: null,
      },
    ],
    unresolved: [
      `Demo fallback active: ${documentName} was not read by the model. These are sample visit-summary findings.`,
      'The document says "2-4 weeks" — confirm the intended follow-up date before scheduling.',
    ],
  };
}
