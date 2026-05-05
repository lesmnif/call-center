"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useSync, useProcess, useCalls } from "@/lib/hooks";
import { BlurFade } from "@/components/ui/blur-fade";
import { SyncBar } from "@/components/sync-bar";
import { StatsRow } from "@/components/stats-row";
import { Filters, applyFilters, type FilterState } from "@/components/filters";
import { CallsTable } from "@/components/calls-table";
import { DATA_QUALITY_CUTOFF } from "@/lib/constants";

// Heavy tabs are code-split: their JS (including Recharts for AnalyticsView) is
// not downloaded until the user actually clicks the tab. Once a tab is visited,
// we keep it mounted (display:none when inactive) so re-switching is instant
// and the tab's useMemo aggregations don't re-run.
const AgentScorecard = dynamic(
  () => import("@/components/agent-scorecard").then((m) => m.AgentScorecard),
  { ssr: false, loading: () => <TabLoading /> }
);
const AnalyticsView = dynamic(
  () => import("@/components/analytics-view").then((m) => m.AnalyticsView),
  { ssr: false, loading: () => <TabLoading /> }
);
const ReportsPanel = dynamic(
  () => import("@/components/reports-panel").then((m) => m.ReportsPanel),
  { ssr: false, loading: () => <TabLoading /> }
);

function TabLoading() {
  return (
    <div className="flex items-center gap-2 py-12 justify-center">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 animate-pulse" />
      <span className="text-[11px] font-mono text-muted-foreground/40">Loading…</span>
    </div>
  );
}

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
  customDateFrom: "",
  customDateTo: "",
  timeSort: "desc",
};

export default function Dashboard() {
  const { syncing, result: syncResult, startSync } = useSync();
  const { processing, events: processEvents, progress, startProcess } = useProcess();
  const { calls, loading, refetch } = useCalls();
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [view, setView] = useState<"calls" | "agents" | "analytics" | "reports">("calls");

  // Track which tabs the user has visited. Once visited, a tab stays mounted
  // (just hidden via CSS when inactive) so its aggregations + chart trees
  // survive subsequent tab switches and re-displaying is instant.
  const [visited, setVisited] = useState<Set<string>>(() => new Set(["calls"]));
  useEffect(() => {
    setVisited((prev) => (prev.has(view) ? prev : new Set(prev).add(view)));
  }, [view]);

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

  // Sync and processing are now button-only (no auto-trigger on page load).
  // Refetch the call list when a sync finishes so new rows appear.
  useEffect(() => {
    if (!syncing && syncResult !== null) {
      refetch();
    }
  }, [syncing, syncResult, refetch]);

  // While processing is running, refresh the table every 10s so rows update live.
  useEffect(() => {
    if (!processing) return;
    const interval = setInterval(refetch, 10_000);
    return () => clearInterval(interval);
  }, [processing, refetch]);

  // Refetch once more after a processing batch finishes to pick up final rows.
  const prevProcessing = useRef(false);
  useEffect(() => {
    const wasProcessing = prevProcessing.current;
    prevProcessing.current = processing;
    if (wasProcessing && !processing) {
      const timer = setTimeout(refetch, 500);
      return () => clearTimeout(timer);
    }
  }, [processing, refetch]);

  const handleProcessOne = useCallback(
    (recordingId: number) => startProcess([recordingId]),
    [startProcess]
  );

  const handleProcessAll = useCallback(
    () => startProcess(pendingIds),
    [startProcess, pendingIds]
  );

  const pendingCount = pendingIds.length;
  const filtered = useMemo(
    () => applyFilters(qualityCalls, filters),
    [qualityCalls, filters]
  );
  const hasActiveFilters = useMemo(
    () =>
      filters.search !== "" ||
      filters.store !== "__all__" ||
      filters.agent !== "__all__" ||
      filters.category !== "__all__" ||
      filters.sentiment !== "__all__" ||
      filters.outcome !== "__all__" ||
      filters.salesActivity !== "__all__" ||
      filters.orderType !== "__all__" ||
      filters.dateRange !== "all",
    [filters]
  );

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
                {
                  key: "reports",
                  label: "Reports",
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
                      <path d="M3 2h7a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.1"/>
                      <path d="M4.5 5h4M4.5 7h3M4.5 9h3.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
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

        {/* All visited tabs stay mounted; only the active one is visible. */}
        <div hidden={view !== "calls"}>
          <div className="space-y-4">
            <StatsRow calls={filtered} />
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
            <CallsTable calls={filtered} onProcess={handleProcessOne} isFiltered={hasActiveFilters} timeSort={filters.timeSort} />
          </div>
        </div>

        {visited.has("agents") && (
          <div hidden={view !== "agents"}>
            <AgentScorecard calls={qualityCalls} onProcess={handleProcessOne} />
          </div>
        )}

        {visited.has("analytics") && (
          <div hidden={view !== "analytics"}>
            <AnalyticsView calls={qualityCalls} />
          </div>
        )}

        {visited.has("reports") && (
          <div hidden={view !== "reports"}>
            <ReportsPanel calls={qualityCalls} />
          </div>
        )}

      </main>
    </div>
  );
}
