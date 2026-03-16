"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSync, useProcess, useCalls } from "@/lib/hooks";
import { BlurFade } from "@/components/ui/blur-fade";
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
  dateRange: "all",
  timeSort: "desc",
};

export default function Dashboard() {
  const { syncing, result: syncResult, startSync } = useSync();
  const { processing, events: processEvents, progress, startProcess } = useProcess();
  const { calls, loading, refetch } = useCalls();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const hasAutoSynced = useRef(false);
  const hasAutoProcessed = useRef(false);

  const pendingIds = useMemo(
    () =>
      calls
        .filter((c) => c.status === "pending" || c.status === "failed")
        .map((c) => c.recording_id),
    [calls]
  );

  useEffect(() => {
    if (!hasAutoSynced.current) {
      hasAutoSynced.current = true;
      startSync();
    }
  }, [startSync]);

  useEffect(() => {
    if (!syncing && syncResult !== null) {
      refetch();
    }
  }, [syncing, syncResult, refetch]);

  useEffect(() => {
    if (
      !hasAutoProcessed.current &&
      !syncing &&
      syncResult !== null &&
      !loading &&
      pendingIds.length > 0 &&
      !processing
    ) {
      hasAutoProcessed.current = true;
      startProcess(pendingIds);
    }
  }, [syncing, syncResult, loading, pendingIds, processing, startProcess]);

  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const lastEvent = processEvents[processEvents.length - 1];
    if (lastEvent?.type === "done" || lastEvent?.type === "fatal") {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => refetch(), 500);
    }
  }, [processEvents, refetch]);

  const handleProcessOne = useCallback(
    (recordingId: number) => startProcess([recordingId]),
    [startProcess]
  );

  const handleProcessAll = useCallback(
    () => startProcess(pendingIds),
    [startProcess, pendingIds]
  );

  const pendingCount = pendingIds.length;
  const filtered = applyFilters(calls, filters);
  const hasActiveFilters =
    filters.search !== "" ||
    filters.store !== "__all__" ||
    filters.agent !== "__all__" ||
    filters.category !== "__all__" ||
    filters.sentiment !== "__all__" ||
    filters.dateRange !== "all";

  return (
    <div className="min-h-screen bg-background">

      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20">
        {/* Indigo accent line */}
        <div className="accent-gradient h-[2px] w-full" />

        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <BlurFade delay={0} duration={0.5}>
            <div className="flex items-center justify-between h-14">

              {/* Brand */}
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                  style={{ background: "oklch(0.56 0.23 275 / 0.1)", border: "1px solid oklch(0.56 0.23 275 / 0.2)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 3.5C2 2.67 2.67 2 3.5 2h7C11.33 2 12 2.67 12 3.5v7c0 .83-.67 1.5-1.5 1.5h-7A1.5 1.5 0 012 10.5v-7z" fill="oklch(0.56 0.23 275 / 0.15)"/>
                    <path d="M4.5 5.5h5M4.5 7h3.5M4.5 8.5h4" stroke="oklch(0.56 0.23 275)" strokeWidth="1.1" strokeLinecap="round"/>
                  </svg>
                </div>
                <div>
                  <h1 className="text-[14px] font-bold leading-none tracking-tight text-foreground">
                    Kolas{" "}
                    <span className="font-semibold" style={{ color: "oklch(0.56 0.23 275)" }}>
                      Intelligence
                    </span>
                  </h1>
                  <p className="text-[9px] font-mono text-muted-foreground/50 mt-0.5 tracking-widest uppercase leading-none">
                    Call Center
                  </p>
                </div>
              </div>

              {/* Right: subtle sync status dot only */}
              {loading && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />
                  <span className="text-[11px] font-mono text-muted-foreground/40">Loading…</span>
                </div>
              )}
            </div>
          </BlurFade>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 lg:px-8 py-6 space-y-4">

        <BlurFade delay={0.05} duration={0.45}>
          <SyncBar
            syncing={syncing}
            processing={processing}
            progress={progress}
            events={processEvents}
            pendingCount={pendingCount}
            onSync={startSync}
            onProcess={handleProcessAll}
          />
        </BlurFade>

        <BlurFade delay={0.10} duration={0.45}>
          <StatsRow calls={calls} />
        </BlurFade>

        <BlurFade delay={0.15} duration={0.45}>
          <div className="space-y-2.5">
            <Filters calls={calls} filters={filters} onChange={setFilters} />
            <div className="flex items-center gap-2 pl-0.5">
              <p className="text-xs font-mono text-muted-foreground/50 tabular-nums">
                {filtered.length === calls.length
                  ? `${calls.length.toLocaleString()} calls`
                  : `${filtered.length.toLocaleString()} of ${calls.length.toLocaleString()}`}
              </p>
              {filtered.length !== calls.length && (
                <span className="text-xs font-mono text-muted-foreground/35">· filtered</span>
              )}
            </div>
          </div>
        </BlurFade>

        <BlurFade delay={0.20} duration={0.45}>
          <CallsTable calls={filtered} onProcess={handleProcessOne} isFiltered={hasActiveFilters} timeSort={filters.timeSort} />
        </BlurFade>

      </main>
    </div>
  );
}
