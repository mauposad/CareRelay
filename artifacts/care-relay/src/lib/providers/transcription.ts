export interface TranscriptionResult {
  transcript: string;
  language: string;
  confidence: number;
  segments: { text: string; startMs: number; endMs: number }[];
  needsReview: boolean;
}

export interface TranscriptionProvider {
  transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult>;
}

export const mockTranscriptionProvider: TranscriptionProvider = {
  async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    // Artificial delay for transcription simulation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // For the demo, we just simulate the primary deterministic transcript
    return {
      transcript: "PT moved to Friday at 10. John can drive. Mom felt tired after breakfast.",
      language: "en",
      confidence: 0.94,
      segments: [
        { text: "PT moved to Friday at 10.", startMs: 0, endMs: 2800 },
        { text: "John can drive.", startMs: 2800, endMs: 4000 },
        { text: "Mom felt tired after breakfast.", startMs: 4000, endMs: 6500 }
      ],
      needsReview: false
    };
  }
};
