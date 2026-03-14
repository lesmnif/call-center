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
};

// --- API calls ---

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
        },
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      };
    },
    { onRetry: opts?.onRetry }
  );
}
