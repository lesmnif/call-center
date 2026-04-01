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

export function useCalls() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof getSupabaseClient> | null>(null);

  const fetchCalls = useCallback(async () => {
    if (!supabaseRef.current) {
      supabaseRef.current = getSupabaseClient();
    }
    setLoading(true);

    // Supabase caps queries at 1000 rows by default — paginate to load all records
    // so stats and analytics always reflect the complete dataset.
    const PAGE_SIZE = 1000;
    const allData: CallRecord[] = [];
    let from = 0;
    let keepGoing = true;

    while (keepGoing) {
      const { data, error } = await supabaseRef.current
        .from("calls")
        .select("*")
        .order("start_time", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      allData.push(...(data as CallRecord[]));
      keepGoing = data.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    setCalls(allData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  return { calls, loading, refetch: fetchCalls };
}
