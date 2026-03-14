"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
    .find((e) => e.type === "done") as Extract<
    ProcessEvent,
    { type: "done" }
  > | null;

  const stepLabel = progress?.step ?? "processing";

  const statusText = processing
    ? progress
      ? `Processing ${progress.current}/${progress.total} — ${stepLabel}...${
          errorCount > 0 ? ` (${errorCount} failed)` : ""
        }`
      : "Starting..."
    : syncing
    ? "Syncing recordings..."
    : lastDone
    ? `Last run: ${lastDone.processed} processed, ${lastDone.failed} failed${
        lastDone.totalCost ? ` ($${lastDone.totalCost})` : ""
      }`
    : pendingCount > 0
    ? `${pendingCount} recording${pendingCount === 1 ? "" : "s"} pending`
    : "Ready";

  const pct =
    processing && progress && progress.total > 0
      ? (progress.current / progress.total) * 100
      : 0;

  const doneWithFailures = !processing && lastDone && lastDone.failed > 0;

  const dotColor = doneWithFailures ? "bg-amber-500" : "bg-emerald-500";
  const dotPing = doneWithFailures ? "bg-amber-400" : "bg-emerald-400";
  const barColor =
    doneWithFailures || errorCount > 0 ? "bg-amber-500" : "bg-emerald-500";

  const busy = syncing || processing;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {(busy || doneWithFailures) && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {busy && (
                <span
                  className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotPing} opacity-75`}
                />
              )}
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`}
              />
            </span>
          )}
          <span className="text-sm text-muted-foreground truncate">
            {statusText}
          </span>
          {processing && (
            <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>
        {processing && progress && progress.total > 0 && (
          <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full ${barColor} transition-all duration-300`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          onClick={onSync}
          disabled={busy}
          variant="outline"
        >
          {syncing ? "Syncing..." : "Sync Recordings"}
        </Button>
        <Button
          size="sm"
          onClick={onProcess}
          disabled={busy || pendingCount === 0}
          variant={pendingCount > 0 ? "default" : "outline"}
        >
          {processing
            ? "Processing..."
            : `Process Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
        </Button>
      </div>
    </div>
  );
}
