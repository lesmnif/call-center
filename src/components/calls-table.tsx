"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, SearchX } from "lucide-react";
import { type CallRecord } from "@/lib/supabase";
import { TZ, todayPacific, dateToPacificStr } from "@/lib/timezone";
import { CallDetail } from "./call-detail";

type Props = {
  calls: CallRecord[];
  onProcess?: (recordingId: number) => void;
  isFiltered?: boolean;
  timeSort?: "desc" | "asc";
};

type SortKey = "time" | "agent" | "store" | "category" | "sentiment";
type SortDir = "asc" | "desc";

const SENTIMENT = {
  positive: { color: "oklch(0.59 0.17 148)", bg: "oklch(0.59 0.17 148 / 0.1)",  border: "oklch(0.59 0.17 148 / 0.25)", label: "Positive" },
  negative: { color: "oklch(0.56 0.21 20)",  bg: "oklch(0.56 0.21 20 / 0.1)",   border: "oklch(0.56 0.21 20 / 0.25)",  label: "Negative" },
  neutral:  { color: "oklch(0.55 0.04 258)", bg: "oklch(0.55 0.04 258 / 0.08)", border: "oklch(0.55 0.04 258 / 0.2)",  label: "Neutral"  },
};

const OUTCOME = {
  resolved:         { color: "oklch(0.59 0.17 148)", label: "Resolved"  },
  follow_up_needed: { color: "oklch(0.60 0.17 60)",  label: "Follow-up" },
  escalated:        { color: "oklch(0.56 0.21 20)",  label: "Escalated" },
};

const SENTIMENT_ORDER: Record<string, number> = { positive: 0, neutral: 1, negative: 2 };

function formatDate(t: string | null) {
  if (!t) return { top: "—", bottom: "" };
  const d = new Date(t);
  const dateStr = dateToPacificStr(d);
  const today = todayPacific();
  const yesterday = dateToPacificStr(new Date(Date.now() - 86400000));

  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  });

  if (dateStr === today) return { top: "Today", bottom: timeStr };
  if (dateStr === yesterday) return { top: "Yesterday", bottom: timeStr };
  return {
    top: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }),
    bottom: timeStr,
  };
}

// Grid template: accent | time | summary | agent/customer | store | category | outcome
const GRID = "grid-cols-[3px_88px_1fr_150px_110px_120px_110px]";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 opacity-70" />
    : <ChevronDown className="w-3 h-3 opacity-70" />;
}

export function CallsTable({ calls, onProcess, isFiltered = false, timeSort = "desc" }: Props) {
  const [selected, setSelected] = useState<CallRecord | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) {
      // Use timeSort as the default ordering when no column sort is active
      return [...calls].sort((a, b) => {
        const cmp = (a.start_time ?? "").localeCompare(b.start_time ?? "");
        return timeSort === "desc" ? -cmp : cmp;
      });
    }
    return [...calls].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "time") {
        cmp = (a.start_time ?? "").localeCompare(b.start_time ?? "");
      } else if (sortKey === "agent") {
        cmp = (a.agent_name ?? "").localeCompare(b.agent_name ?? "");
      } else if (sortKey === "store") {
        cmp = (a.store ?? "").localeCompare(b.store ?? "");
      } else if (sortKey === "category") {
        cmp = (a.category ?? "").localeCompare(b.category ?? "");
      } else if (sortKey === "sentiment") {
        cmp = (SENTIMENT_ORDER[a.sentiment ?? ""] ?? 3) - (SENTIMENT_ORDER[b.sentiment ?? ""] ?? 3);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [calls, sortKey, sortDir]);

  if (calls.length === 0) {
    if (isFiltered) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center bg-card rounded-xl card-elevated">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <SearchX className="w-5 h-5 text-muted-foreground/40" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-muted-foreground">No results</p>
            <p className="text-xs font-mono text-muted-foreground/50">Try adjusting or clearing your filters</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center bg-card rounded-xl card-elevated">
        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-muted-foreground/40">
            <path d="M3 4.5a1.5 1.5 0 011.5-1.5h9A1.5 1.5 0 0115 4.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 013 13.5v-9z" stroke="currentColor" strokeWidth="1.25"/>
            <path d="M6.75 9h4.5M6.75 11.25h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-muted-foreground">No recordings found</p>
          <p className="text-xs font-mono text-muted-foreground/50">Click Sync to fetch from 3CX</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-card rounded-xl card-elevated overflow-hidden">

        {/* Header */}
        <div className={`grid ${GRID} bg-muted/60 border-b border-border px-1`}>
          <div />
          <button
            onClick={() => handleSort("time")}
            className="px-3 py-2.5 flex items-center gap-1 cursor-pointer hover:text-foreground/80 transition-colors group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 group-hover:text-muted-foreground/80">Time</span>
            <SortIcon col="time" sortKey={sortKey} sortDir={sortDir} />
          </button>
          <div className="px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Summary</span>
          </div>
          <button
            onClick={() => handleSort("agent")}
            className="px-4 py-2.5 flex items-center gap-1 cursor-pointer hover:text-foreground/80 transition-colors group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 group-hover:text-muted-foreground/80">Agent · Customer</span>
            <SortIcon col="agent" sortKey={sortKey} sortDir={sortDir} />
          </button>
          <button
            onClick={() => handleSort("store")}
            className="px-4 py-2.5 flex items-center gap-1 cursor-pointer hover:text-foreground/80 transition-colors group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 group-hover:text-muted-foreground/80">Store</span>
            <SortIcon col="store" sortKey={sortKey} sortDir={sortDir} />
          </button>
          <button
            onClick={() => handleSort("category")}
            className="px-4 py-2.5 flex items-center gap-1 cursor-pointer hover:text-foreground/80 transition-colors group"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 group-hover:text-muted-foreground/80">Category</span>
            <SortIcon col="category" sortKey={sortKey} sortDir={sortDir} />
          </button>
          <button
            onClick={() => handleSort("sentiment")}
            className="px-4 py-2.5 flex items-center justify-end gap-1 cursor-pointer hover:text-foreground/80 transition-colors group w-full"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 group-hover:text-muted-foreground/80">Outcome</span>
            <SortIcon col="sentiment" sortKey={sortKey} sortDir={sortDir} />
          </button>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border/60">
          {sorted.map((call) => {
            const isDone       = call.status === "done";
            const isProcessing = call.status === "processing";
            const isPending    = call.status === "pending" || call.status === "failed";
            const { top, bottom } = formatDate(call.start_time);

            const sentimentKey = (call.sentiment ?? "") as keyof typeof SENTIMENT;
            const sentiment = isDone && sentimentKey in SENTIMENT ? SENTIMENT[sentimentKey] : null;

            const outcomeKey = (call.outcome ?? "") as keyof typeof OUTCOME;
            const outcome = isDone && outcomeKey in OUTCOME ? OUTCOME[outcomeKey] : null;

            const leftBorderColor = isProcessing
              ? "oklch(0.56 0.23 275)"
              : sentiment
              ? sentiment.color
              : "transparent";

            return (
              <div
                key={call.recording_id}
                onClick={() => setSelected(call)}
                className={`grid ${GRID} cursor-pointer transition-colors duration-100 hover:bg-muted/30 group`}
                style={{ opacity: isPending ? 0.6 : 1 }}
              >
                {/* Left accent strip */}
                <div className="self-stretch" style={{ background: leftBorderColor }} />

                {/* Time */}
                <div className="px-3 py-4 flex flex-col justify-center gap-0.5">
                  <span
                    className="text-[11px] font-mono leading-none"
                    style={{ color: top === "Today" ? "oklch(0.56 0.23 275)" : "oklch(0.145 0.012 258 / 0.7)" }}
                  >
                    {top}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/45 leading-none">{bottom}</span>
                  {isDone && call.duration_seconds != null && (
                    <span className="text-[9px] font-mono text-muted-foreground/30 leading-none">
                      {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                  {isProcessing && (
                    <span className="flex items-center gap-1 mt-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 bg-primary" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                      </span>
                      <span className="text-[9px] font-semibold text-primary uppercase tracking-wider">
                        Processing
                      </span>
                    </span>
                  )}
                </div>

                {/* Summary — hero */}
                <div className="px-4 py-4 flex flex-col justify-center min-w-0">
                  {isDone && call.summary ? (
                    <div className="space-y-1">
                      <p className="text-[13px] text-foreground/85 leading-relaxed line-clamp-2 group-hover:text-foreground transition-colors">
                        {call.summary}
                      </p>
                      {(call.revenue != null && call.revenue > 0 || call.upsell_attempted || (call.upsell_opportunities && !call.upsell_attempted)) && (
                        <div className="flex items-center gap-1.5">
                          {call.revenue != null && call.revenue > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ color: "oklch(0.46 0.17 148)", background: "oklch(0.59 0.17 148 / 0.1)" }}>
                              ${call.revenue.toFixed(2)}
                            </span>
                          )}
                          {call.upsell_attempted && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ color: "oklch(0.50 0.17 275)", background: "oklch(0.56 0.23 275 / 0.1)" }}>
                              Upsell
                            </span>
                          )}
                          {call.upsell_opportunities && !call.upsell_attempted && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ color: "oklch(0.55 0.17 60)", background: "oklch(0.60 0.17 60 / 0.1)" }}>
                              Missed Upsell
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ) : isProcessing ? (
                    <div className="space-y-1.5 py-0.5">
                      <div className="h-3 shimmer rounded-md w-4/5" />
                      <div className="h-3 shimmer rounded-md w-3/5" />
                    </div>
                  ) : call.status === "failed" ? (
                    <span className="text-xs text-destructive/70 font-medium">
                      Processing failed — click to retry
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">Awaiting analysis</span>
                  )}
                </div>

                {/* Agent · Customer */}
                <div className="px-4 py-4 flex flex-col justify-center gap-1 min-w-0">
                  {call.agent_name && (
                    <span className="text-[12px] font-medium text-foreground/80 truncate leading-none">
                      {call.agent_name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  )}
                  {isDone && call.customer_name ? (
                    <span className="text-[11px] text-muted-foreground/55 truncate leading-none">
                      {call.customer_name}
                    </span>
                  ) : call.caller_phone ? (
                    <span className="text-[10px] font-mono text-muted-foreground/40 truncate leading-none">
                      {call.caller_phone}
                    </span>
                  ) : null}
                </div>

                {/* Store */}
                <div className="px-4 py-4 flex flex-col justify-center min-w-0">
                  {isDone && call.store ? (
                    <span className="text-[12px] text-foreground/70 truncate leading-none">
                      {call.store}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/25 text-sm">—</span>
                  )}
                </div>

                {/* Category */}
                <div className="px-4 py-4 flex flex-col justify-center min-w-0">
                  {isDone && call.category ? (
                    <span className="inline-flex self-start items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium capitalize border bg-primary/8 text-primary border-primary/20 leading-none whitespace-nowrap">
                      {call.category.replace(/_/g, " ")}
                    </span>
                  ) : !isDone && call.status !== "processing" ? (
                    <span className="text-[10px] font-mono text-muted-foreground/35 capitalize">{call.status}</span>
                  ) : null}
                </div>

                {/* Outcome · Sentiment */}
                <div className="px-4 py-4 flex flex-col items-end justify-center gap-1.5">
                  {outcome && (
                    <span className="text-[11px] font-semibold" style={{ color: outcome.color }}>
                      {outcome.label}
                    </span>
                  )}
                  {sentiment && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: sentiment.color }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sentiment.color }} />
                      {sentiment.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CallDetail
        call={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onProcess={onProcess}
      />
    </>
  );
}
