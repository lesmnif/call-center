"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSync, useProcess, useCalls } from "@/lib/hooks";
import { BlurFade } from "@/components/ui/blur-fade";
import { SyncBar } from "@/components/sync-bar";
import { StatsRow } from "@/components/stats-row";
import { Filters, applyFilters, type FilterState } from "@/components/filters";
import { CallsTable } from "@/components/calls-table";
import { AgentScorecard } from "@/components/agent-scorecard";
import { AnalyticsView } from "@/components/analytics-view";
import { DATA_QUALITY_CUTOFF } from "@/lib/constants";

// Pre-parsed once — avoids re-parsing the offset string on every render/filter
const CUTOFF_MS = new Date(DATA_QUALITY_CUTOFF).getTime();

const DEFAULT_FILTERS: FilterState = {
  search: "",
  store: "__all__",
  agent: "__all__",
  category: "__all__",
  sentiment: "__all__",
  outcome: "__all__",
  salesActivity: "__all__",
  orderType: "__all__",
  dateRange: "all",
  timeSort: "desc",
};

export default function Dashboard() {
  const { syncing, result: syncResult, startSync } = useSync();
  const { processing, events: processEvents, progress, startProcess } = useProcess();
  const { calls, loading, refetch } = useCalls();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view, setView] = useState<"calls" | "agents" | "analytics">("calls");
  const hasAutoSynced = useRef(false);
  const autoDispatchedIds = useRef<Set<number>>(new Set());

  // All actionable calls — used for the manual Analyze button (includes failed so user can retry)
  // Filter out skipped calls from all UI components
  const activeCalls = useMemo(() => calls.filter(c => c.status !== "skipped"), [calls]);

  // Filter out old data with missing fields — only use calls on or after DATA_QUALITY_CUTOFF.
  // Uses Date comparison (not string compare) because start_time is UTC ("...Z") while
  // DATA_QUALITY_CUTOFF uses a Pacific offset ("-07:00"). String compare would incorrectly
  // include Wednesday evening calls (e.g. "2026-03-19T01:00:00Z" > "2026-03-19T00:00:00-07:00").
  const qualityCalls = useMemo(
    () => activeCalls.filter(c => c.start_time && new Date(c.start_time).getTime() >= CUTOFF_MS),
    [activeCalls]
  );

  const pendingIds = useMemo(
    () =>
      calls
        .filter((c) => c.status === "pending" || c.status === "failed")
        .map((c) => c.recording_id),
    [calls]
  );

  // Pending calls for auto-dispatch (primary priority)
  const autoPendingIds = useMemo(
    () => calls.filter((c) => c.status === "pending").map((c) => c.recording_id),
    [calls]
  );

  // Failed calls — retried automatically after all pending are done
  const autoFailedIds = useMemo(
    () => calls.filter((c) => c.status === "failed").map((c) => c.recording_id),
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

  // Auto-dispatch: pending first, then retry failed once pending are exhausted.
  // autoDispatchedIds tracks which IDs were sent to avoid double-dispatch within a session.
  useEffect(() => {
    if (!syncing && syncResult !== null && !loading && !processing) {
      // First: dispatch any undispatched pending calls
      const undispatchedPending = autoPendingIds.filter(
        (id) => !autoDispatchedIds.current.has(id)
      );
      if (undispatchedPending.length > 0) {
        undispatchedPending.forEach((id) => autoDispatchedIds.current.add(id));
        startProcess(undispatchedPending);
        return;
      }

      // Then: retry failed calls that haven't been dispatched yet
      const undispatchedFailed = autoFailedIds.filter(
        (id) => !autoDispatchedIds.current.has(id)
      );
      if (undispatchedFailed.length > 0) {
        undispatchedFailed.forEach((id) => autoDispatchedIds.current.add(id));
        startProcess(undispatchedFailed);
      }
    }
  }, [syncing, syncResult, loading, autoPendingIds, autoFailedIds, processing, startProcess]);

  // After each processing run ends: refetch, then reset dispatched tracking
  // so any calls that are still 'pending' (missed for any reason) get picked up.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const lastEvent = processEvents[processEvents.length - 1];
    if (lastEvent?.type === "done" || lastEvent?.type === "fatal") {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => {
        // Clear only — failed calls won't re-enter because they're excluded from autoPendingIds
        autoDispatchedIds.current.clear();
        refetch();
      }, 500);
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
  const filtered = applyFilters(qualityCalls, filters);
  const hasActiveFilters =
    filters.search !== "" ||
    filters.store !== "__all__" ||
    filters.agent !== "__all__" ||
    filters.category !== "__all__" ||
    filters.sentiment !== "__all__" ||
    filters.outcome !== "__all__" ||
    filters.salesActivity !== "__all__" ||
    filters.orderType !== "__all__" ||
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

        {/* View toggle */}
        <BlurFade delay={0.10} duration={0.45}>
          <div className="flex items-center gap-0.5 p-1 rounded-xl bg-muted border border-border w-fit">
            {(
              [
                {
                  key: "calls",
                  label: "Calls",
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                      <path d="M2.5 2h8a.5.5 0 01.5.5v8a.5.5 0 01-.5.5h-8A.5.5 0 012 10.5v-8A.5.5 0 012.5 2z" stroke="currentColor" strokeWidth="1.1"/>
                      <path d="M4 5h5M4 7h3.5M4 9h4.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    </svg>
                  ),
                },
                {
                  key: "agents",
                  label: "Agents",
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                      <circle cx="6.5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.1"/>
                      <path d="M2 11c0-2.21 2.015-4 4.5-4s4.5 1.79 4.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    </svg>
                  ),
                },
                {
                  key: "analytics",
                  label: "Analytics",
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                      <path d="M2 10.5l2.5-3 2.5 1.5 2-3L11 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                      <circle cx="2" cy="10.5" r="0.75" fill="currentColor"/>
                      <circle cx="4.5" cy="7.5" r="0.75" fill="currentColor"/>
                      <circle cx="7" cy="9" r="0.75" fill="currentColor"/>
                      <circle cx="9" cy="6" r="0.75" fill="currentColor"/>
                      <circle cx="11" cy="7" r="0.75" fill="currentColor"/>
                    </svg>
                  ),
                },
              ] as const
            ).map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  view === key
                    ? "text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10"
                }`}
                style={
                  view === key
                    ? { background: "oklch(0.56 0.23 275)", boxShadow: "0 1px 3px oklch(0.56 0.23 275 / 0.35)" }
                    : undefined
                }
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </BlurFade>

        {view === "calls" ? (
          <>
            <BlurFade delay={0.12} duration={0.45}>
              <StatsRow calls={filtered} />
            </BlurFade>

            <BlurFade delay={0.17} duration={0.45}>
              <div className="space-y-2.5">
                <Filters calls={qualityCalls} filters={filters} onChange={setFilters} />
                <div className="flex items-center gap-2 pl-0.5">
                  <p className="text-xs font-mono text-muted-foreground/50 tabular-nums">
                    {filtered.length === qualityCalls.length
                      ? `${qualityCalls.length.toLocaleString()} calls`
                      : `${filtered.length.toLocaleString()} of ${qualityCalls.length.toLocaleString()}`}
                  </p>
                  {filtered.length !== qualityCalls.length && (
                    <span className="text-xs font-mono text-muted-foreground/35">· filtered</span>
                  )}
                </div>
              </div>
            </BlurFade>

            <BlurFade delay={0.22} duration={0.45}>
              <CallsTable calls={filtered} onProcess={handleProcessOne} isFiltered={hasActiveFilters} timeSort={filters.timeSort} />
            </BlurFade>
          </>
        ) : view === "agents" ? (
          <BlurFade delay={0.12} duration={0.45}>
            <AgentScorecard calls={qualityCalls} onProcess={handleProcessOne} />
          </BlurFade>
        ) : (
          <BlurFade delay={0.12} duration={0.45}>
            <AnalyticsView calls={qualityCalls} />
          </BlurFade>
        )}

      </main>
    </div>
  );
}
