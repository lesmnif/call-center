"use client";

import { useEffect, useRef, useState } from "react";
import { type ProcessEvent } from "@/lib/hooks";

type Props = {
  syncing: boolean;
  processing: boolean;
  progress: { current: number; total: number; step: string } | null;
  events: ProcessEvent[];
  pendingCount: number;
  onSync: () => void;
  onProcess: () => void;
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function SyncBar({
  syncing,
  processing,
  progress,
  events,
  pendingCount,
  onSync,
  onProcess,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (processing) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [processing]);

  const errorCount = events.filter((e) => e.type === "error").length;
  const lastDone = [...events]
    .reverse()
    .find((e) => e.type === "done") as Extract<ProcessEvent, { type: "done" }> | null;

  const stepLabel = progress?.step ?? "processing";
  const busy = syncing || processing;
  const doneWithFailures = !processing && lastDone && lastDone.failed > 0;
  const isHealthy = !busy && !doneWithFailures && pendingCount === 0;

  const pct =
    processing && progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  // Dot color
  const dotColor = processing
    ? "oklch(0.56 0.23 275)"       // indigo
    : syncing
    ? "oklch(0.72 0.15 60)"        // amber
    : doneWithFailures
    ? "oklch(0.65 0.17 50)"        // orange
    : isHealthy || (lastDone && lastDone.failed === 0)
    ? "oklch(0.59 0.17 148)"       // green
    : "oklch(0.59 0.17 148)";      // green

  const statusText = processing
    ? progress
      ? `${progress.current} of ${progress.total} · ${stepLabel}${errorCount > 0 ? ` · ${errorCount} errors` : ""}`
      : "Starting..."
    : syncing
    ? "Syncing from 3CX..."
    : lastDone
    ? `Done — ${lastDone.processed} processed${lastDone.failed > 0 ? `, ${lastDone.failed} failed` : ""}`
    : pendingCount > 0
    ? `${pendingCount} recording${pendingCount === 1 ? "" : "s"} pending analysis`
    : "Up to date";

  return (
    <div className="flex items-center gap-3 bg-card rounded-xl card-elevated px-4 py-2.5">

      {/* Status dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {busy && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
            style={{ background: dotColor }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: dotColor }}
        />
      </span>

      {/* Text */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {processing && progress ? (
          <>
            <span className="text-[11px] font-semibold" style={{ color: "oklch(0.56 0.23 275)" }}>
              Analyzing
            </span>
            <span className="text-[11px] text-muted-foreground/60 font-mono truncate">{statusText}</span>
            <span className="text-[11px] font-mono text-muted-foreground/40 ml-auto shrink-0">
              {formatElapsed(elapsed)}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground/70 font-mono">{statusText}</span>
        )}
      </div>

      {/* Progress bar */}
      {processing && progress && progress.total > 0 && (
        <div className="shrink-0 flex items-center gap-2">
          <div className="w-20 h-1 rounded-full bg-border overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: "oklch(0.56 0.23 275)" }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums w-7 text-right">
            {pct}%
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={onSync}
          disabled={busy}
          className="h-7 px-3 text-[11px] font-mono font-medium rounded-lg border border-border text-muted-foreground/60 hover:text-foreground/80 hover:border-border/80 hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {syncing ? "Syncing..." : "Sync"}
        </button>

        <button
          onClick={onProcess}
          disabled={busy || pendingCount === 0}
          className={`h-7 px-3.5 text-[11px] font-semibold rounded-lg transition-all ${
            pendingCount > 0 && !busy
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              : "bg-muted text-muted-foreground/40 cursor-not-allowed"
          }`}
        >
          {processing
            ? "Analyzing..."
            : pendingCount > 0
            ? `Analyze (${pendingCount})`
            : "Analyze"}
        </button>
      </div>
    </div>
  );
}
