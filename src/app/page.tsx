"use client";

import { useState, useEffect, useCallback } from "react";
import { useSync, useProcess, useCalls } from "@/lib/hooks";
import { SyncBar } from "@/components/sync-bar";
import { StatsRow } from "@/components/stats-row";
import { Filters, applyFilters, type FilterState } from "@/components/filters";
import { CallsTable } from "@/components/calls-table";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  store: "__all__",
  agent: "__all__",
  category: "__all__",
  sentiment: "__all__",
};

export default function Dashboard() {
  const { syncing, result: syncResult, startSync } = useSync();
  const { processing, events: processEvents, progress, startProcess } = useProcess();
  const { calls, loading, refetch } = useCalls();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Refetch after sync completes
  useEffect(() => {
    if (!syncing && syncResult !== null) {
      refetch();
    }
  }, [syncing, syncResult, refetch]);

  // Refetch after processing completes
  useEffect(() => {
    const lastEvent = processEvents[processEvents.length - 1];
    if (lastEvent?.type === "done") {
      refetch();
    }
  }, [processEvents, refetch]);

  const handleProcessOne = useCallback(
    (recordingId: number) => {
      startProcess([recordingId]);
    },
    [startProcess]
  );

  const handleProcessAll = useCallback(() => {
    startProcess();
  }, [startProcess]);

  const pendingCount = calls.filter(
    (c) => c.status === "pending" || c.status === "failed"
  ).length;

  const filtered = applyFilters(calls, filters);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Kolas Call Intelligence
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Transcription, summarization &amp; classification
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {loading ? (
                "Loading..."
              ) : (
                <>
                  <span className="font-mono">{calls.length}</span> calls in
                  database
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <SyncBar
          syncing={syncing}
          processing={processing}
          progress={progress}
          events={processEvents}
          pendingCount={pendingCount}
          onSync={startSync}
          onProcess={handleProcessAll}
        />

        <StatsRow calls={calls} />

        <Filters calls={calls} filters={filters} onChange={setFilters} />

        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-muted-foreground">
              {filtered.length === calls.length
                ? `${calls.length} calls`
                : `${filtered.length} of ${calls.length} calls`}
            </p>
          </div>
          <CallsTable calls={filtered} onProcess={handleProcessOne} />
        </div>
      </main>
    </div>
  );
}
