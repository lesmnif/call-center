import OpenAI from "openai";
import { toFile } from "openai";
import { WHISPER_PROMPT, SYSTEM_PROMPT } from "./prompts";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// --- Retry helper ---

type RetryOpts = {
  maxRetries?: number;
  baseDelayMs?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
};

function isTransientError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    return err.status === 429 || (err.status !== undefined && err.status >= 500);
  }
  return false;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOpts = {}
): Promise<T> {
  const { maxRetries = 4, baseDelayMs = 1000, onRetry } = opts;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }
      const delay = baseDelayMs * 2 ** attempt;
      onRetry?.(attempt + 1, err as Error, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// --- Types ---

export type AnalysisResult = {
  agent_name: string | null;
  customer_name: string | null;
  store: string | null;
  category: string | null;
  order_type: string | null;
  products_mentioned: string[];
  order_total: string | null;
  payment_method: string | null;
  summary: string | null;
  sentiment: string | null;
  outcome: string | null;
  key_points: string[];
  action_items: string[];
  language: string | null;
  sale_completed: boolean | null;
  upsell_attempted: boolean | null;
  had_sales_opportunity: boolean | null;
  revenue: number | null;
  efficiency_score: number | null;
  communication_score: number | null;
  resolution_score: number | null;
  score_reasoning: string | null;
  improvement_notes: string | null;
  upsell_opportunities: string | null;
};

export type JunkResult = {
  is_junk: boolean;
  reason: string | null;
};

// --- API calls ---

const JUNK_DETECT_PROMPT = `You are a call center transcript classifier. Determine if this transcript is a JUNK call or a REAL call.

JUNK calls include:
- Voicemail recordings (automated greeting, beep, no two-way conversation)
- IVR / automated menu systems with no human interaction
- Missed calls / dead air / silence transcribed as a few words or nothing
- Robocalls or spam recordings
- Hold music transcribed as repetitive text
- One-sided recordings where only an automated system speaks

REAL calls include:
- Any call with a two-way conversation between a human agent and a customer, even if brief
- Calls where a customer speaks to an agent, even if the call is short or unproductive

Respond with JSON: {"is_junk": true/false, "reason": "brief explanation if junk, null if real"}`;

export async function detectJunk(
  transcript: string,
): Promise<JunkResult> {
  return withRetry(async () => {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: JUNK_DETECT_PROMPT },
        { role: "user", content: transcript },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content ?? "";
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, treat as real call (don't skip)
      return { is_junk: false, reason: null };
    }
    return {
      is_junk: parsed.is_junk === true,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
    };
  });
}

export async function transcribe(
  wavBuffer: ArrayBuffer,
  opts?: { onRetry?: RetryOpts["onRetry"] }
): Promise<{ text: string; estimatedMinutes: number }> {
  return withRetry(
    async () => {
      const file = await toFile(
        new Uint8Array(wavBuffer),
        "recording.wav",
        { type: "audio/wav" }
      );

      const result = await getOpenAI().audio.transcriptions.create({
        model: "whisper-1",
        file,
        prompt: WHISPER_PROMPT,
      });

      const sizeMb = wavBuffer.byteLength / (1024 * 1024);
      const estimatedMinutes = sizeMb / 1.0;

      return { text: result.text, estimatedMinutes };
    },
    { onRetry: opts?.onRetry }
  );
}

export async function analyze(
  transcript: string,
  opts?: { onRetry?: RetryOpts["onRetry"] }
): Promise<{
  analysis: AnalysisResult;
  inputTokens: number;
  outputTokens: number;
}> {
  return withRetry(
    async () => {
      const response = await getOpenAI().chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transcript:\n\n${transcript}` },
        ],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content ?? "{}";
      const parsed = JSON.parse(content);

      return {
        analysis: {
          agent_name: parsed.agent_name ?? null,
          customer_name: parsed.customer_name ?? null,
          store: parsed.store ?? null,
          category: parsed.category ?? null,
          order_type: parsed.order_type ?? null,
          products_mentioned: parsed.products_mentioned ?? [],
          order_total: parsed.order_total ?? null,
          payment_method: parsed.payment_method ?? null,
          summary: parsed.summary ?? null,
          sentiment: parsed.sentiment ?? null,
          outcome: parsed.outcome ?? null,
          key_points: parsed.key_points ?? [],
          action_items: parsed.action_items ?? [],
          language: parsed.language ?? null,
          sale_completed: parsed.sale_completed ?? null,
          upsell_attempted: parsed.upsell_attempted ?? null,
          had_sales_opportunity: parsed.had_sales_opportunity ?? null,
          revenue: parsed.revenue != null ? Number(parsed.revenue) : null,
          efficiency_score: parsed.efficiency_score != null ? Number(parsed.efficiency_score) : null,
          communication_score: parsed.communication_score != null ? Number(parsed.communication_score) : null,
          resolution_score: parsed.resolution_score != null ? Number(parsed.resolution_score) : null,
          score_reasoning: typeof parsed.score_reasoning === "string" ? parsed.score_reasoning : null,
          improvement_notes: typeof parsed.improvement_notes === "string" ? parsed.improvement_notes : null,
          upsell_opportunities: typeof parsed.upsell_opportunities === "string" ? parsed.upsell_opportunities : null,
        },
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    },
    { onRetry: opts?.onRetry }
  );
}
