"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { getSupabaseClient, type CallRecord } from "./supabase";

export type ProcessEvent =
  | { type: "status"; message: string }
  | {
      type: "progress";
      total: number;
      toProcess: number;
    }
  | {
      type: "processing";
      recordingId: number;
      step: string;
      current: number;
      total: number;
    }
  | {
      type: "processed";
      recordingId: number;
      category: string;
      sentiment: string;
      agentName: string | null;
      store: string | null;
      current: number;
      total: number;
    }
  | {
      type: "error";
      recordingId: number;
      message: string;
      current: number;
      total: number;
    }
  | { type: "done"; processed: number; failed: number; totalCost?: number }
  | { type: "fatal"; message: string };

// Keep SyncEvent as alias for backwards compatibility
export type SyncEvent = ProcessEvent;

export function useSync() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ new: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Sync failed");
      setResult(json as { new: number; total: number });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }, []);

  return { syncing, result, error, startSync };
}

export function useProcess() {
  const [processing, setProcessing] = useState(false);
  const [events, setEvents] = useState<ProcessEvent[]>([]);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    step: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startProcess = useCallback(async (recordingIds: number[]) => {
    if (recordingIds.length === 0) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setProcessing(true);
    setEvents([]);
    setProgress(null);

    try {
      // Process recordings one at a time — each request is bounded and won't timeout
      for (let i = 0; i < recordingIds.length; i++) {
        if (controller.signal.aborted) break;

        const recId = recordingIds[i];

        setProgress({ current: i + 1, total: recordingIds.length, step: "starting" });

        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ recordingId: recId }),
          signal: controller.signal,
        });

        if (!res.body) continue;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const cleaned = line.replace(/^data: /, "").trim();
            if (!cleaned) continue;
            try {
              const event: ProcessEvent = JSON.parse(cleaned);
              setEvents((prev) => [...prev, event]);

              if (event.type === "processing") {
                setProgress({
                  current: i + 1,
                  total: recordingIds.length,
                  step: event.step,
                });
              } else if (event.type === "done" || event.type === "fatal") {
                setProgress({
                  current: i + 1,
                  total: recordingIds.length,
                  step: event.type === "done" ? "done" : "failed",
                });
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setEvents((prev) => [
        ...prev,
        {
          type: "fatal",
          message: err instanceof Error ? err.message : String(err),
        },
      ]);
    } finally {
      setProcessing(false);
      setProgress(null);
    }
  }, []);

  return { processing, events, progress, startProcess };
}

// Slim field set for the main list — only what the table/filters/stats/scorecard/
// analytics/reports actually read. Anything used solely by CallDetail (transcript,
// score_reasoning, improvement_notes, key_points, action_items, language, products,
// order_total, payment_method, retry_count) is fetched on demand by useCallDetail.
const LIST_FIELDS = [
  "recording_id", "status", "start_time",
  "agent_name", "customer_name", "caller_phone",
  "store", "category", "order_type",
  "sentiment", "outcome",
  "efficiency_score", "communication_score", "resolution_score",
  "revenue", "sale_completed", "upsell_attempted", "had_sales_opportunity", "upsell_opportunities",
  "duration_seconds",
  "summary",
].join(", ");

// Default to a 30-day window. Older calls are still in the DB and queryable,
// but loading every historical call on page open was the main freeze cause.
export const DEFAULT_WINDOW_DAYS = 30;

export function useCalls(windowDays: number = DEFAULT_WINDOW_DAYS) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);

  const fetchCalls = useCallback(async () => {
    if (!supabaseRef.current) {
      supabaseRef.current = getSupabaseClient();
    }
    setLoading(true);

    const cutoff = new Date(
      Date.now() - windowDays * 24 * 60 * 60 * 1000
    ).toISOString();

    // Supabase caps queries at 1000 rows by default — paginate within the window.
    const PAGE_SIZE = 1000;
    const allData: CallRecord[] = [];
    let from = 0;
    let keepGoing = true;

    while (keepGoing) {
      const { data, error } = await supabaseRef.current
        .from("calls")
        .select(LIST_FIELDS)
        .gte("start_time", cutoff)
        .order("start_time", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      allData.push(...(data as unknown as CallRecord[]));
      keepGoing = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    setCalls(allData);
    setLoading(false);
  }, [windowDays]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return { calls, loading, refetch: fetchCalls };
}

// Fetch the heavy / detail-only fields for a single recording on demand.
// Used by CallDetail so the main list query stays slim.
type CallDetailExtras = Pick<
  CallRecord,
  | "transcript"
  | "score_reasoning"
  | "improvement_notes"
  | "key_points"
  | "action_items"
  | "language"
  | "products"
  | "order_total"
  | "payment_method"
  | "retry_count"
>;

const DETAIL_FIELDS =
  "transcript, score_reasoning, improvement_notes, key_points, action_items, " +
  "language, products, order_total, payment_method, retry_count";

export function useCallDetail(recordingId: number | null) {
  const [extras, setExtras] = useState<CallDetailExtras | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (recordingId == null) {
      setExtras(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setExtras(null);

    const supabase = getSupabaseClient();
    supabase
      .from("calls")
      .select(DETAIL_FIELDS)
      .eq("recording_id", recordingId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setExtras((data as CallDetailExtras | null) ?? null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  return { extras, loading };
}
