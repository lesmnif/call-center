"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { type CallRecord } from "@/lib/supabase";
import { buildReportSnapshot } from "@/lib/report-snapshot";
import { type ReportRecord } from "@/lib/report-types";
import { todayPacific, dateToPacificStr } from "@/lib/timezone";

// Earliest date with good data
const MIN_DATE = "2026-03-19";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTs(ts: string) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Returns YYYY-MM-DD n days before today (Pacific)
function daysAgo(n: number): string {
  const d = new Date(todayPacific() + "T12:00:00");
  d.setDate(d.getDate() - n);
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

const QUICK_RANGES = [
  { label: "Last 7 days",  from: () => daysAgo(6),  to: () => todayPacific() },
  { label: "Last 14 days", from: () => daysAgo(13), to: () => todayPacific() },
  { label: "Last 30 days", from: () => daysAgo(29), to: () => todayPacific() },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type ReportListItem = Pick<
  ReportRecord,
  "id" | "title" | "period_start" | "period_end" | "generated_at" | "prior_report_id"
>;

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl"
        style={{ background: "oklch(0.56 0.23 275 / 0.08)", border: "1px solid oklch(0.56 0.23 275 / 0.15)" }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M5 4h12a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="oklch(0.56 0.23 275)" strokeWidth="1.4"/>
          <path d="M7.5 8h7M7.5 11h5M7.5 14h6" stroke="oklch(0.56 0.23 275)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">No reports yet</p>
        <p className="text-xs text-muted-foreground mt-0.5">Generate your first report using the button above.</p>
      </div>
    </div>
  );
}

function ReportCard({ report, onOpen }: { report: ReportListItem; onOpen: (id: string) => void }) {
  const hasComparison = !!report.prior_report_id;
  return (
    <button
      onClick={() => onOpen(report.id)}
      className="w-full text-left rounded-xl border border-border bg-card p-4 hover:border-border/80 hover:bg-muted/30 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-foreground/80 transition-colors">
            {report.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fmtDate(report.period_start)} – {fmtDate(report.period_end)}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground/50 mt-1.5">
            Generated {fmtTs(report.generated_at)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {hasComparison && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md border"
              style={{ color: "oklch(0.56 0.23 275)", borderColor: "oklch(0.56 0.23 275 / 0.25)", background: "oklch(0.56 0.23 275 / 0.07)" }}>
              vs prior
            </span>
          )}
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors mt-1">
            <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </button>
  );
}

// ── Generate Dialog ───────────────────────────────────────────────────────────

function GenerateDialog({
  calls,
  existingReports,
  onClose,
  onGenerated,
}: {
  calls: CallRecord[];
  existingReports: ReportListItem[];
  onClose: () => void;
  onGenerated: (id: string) => void;
}) {
  const today = todayPacific();
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(today);
  const [priorId, setPriorId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  // Focus title on open
  useEffect(() => { titleRef.current?.focus(); }, []);

  // Live call count for the selected range — use Pacific date to match daily breakdown
  const rangeCount = useMemo(() => {
    if (!from || !to) return 0;
    return calls.filter((c) => {
      if (!c.start_time) return false;
      const d = dateToPacificStr(new Date(c.start_time));
      return d >= from && d <= to;
    }).length;
  }, [calls, from, to]);

  // Range display label
  const rangeLabel = useMemo(() => {
    if (!from && !to) return null;
    const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (from && to && from === to) return fmt(from);
    if (from && to) return `${fmt(from)} – ${fmt(to)}`;
    if (from) return `From ${fmt(from)}`;
    return null;
  }, [from, to]);

  const handleQuick = (f: () => string, t: () => string) => {
    const newFrom = f();
    const newTo = t();
    // Clamp to available data bounds
    setFrom(newFrom < MIN_DATE ? MIN_DATE : newFrom);
    setTo(newTo > today ? today : newTo);
  };

  const handleFromChange = (val: string) => {
    setFrom(val);
    // Clamp "to" if it's before the new "from"
    if (to && val && to < val) {
      setTo(val);
    }
    // Auto-advance focus to "to" input
    if (val) {
      setTimeout(() => toRef.current?.showPicker?.(), 80);
    }
  };

  const handleToChange = (val: string) => {
    // Clamp to >= from
    if (from && val < from) {
      setTo(from);
    } else {
      setTo(val);
    }
  };

  const handleGenerate = async () => {
    if (!title.trim()) { setError("Please enter a report title."); return; }
    if (!from || !to)  { setError("Please select a date range."); return; }
    if (from > to)     { setError("Start date must be before end date."); return; }
    if (rangeCount === 0) { setError("No calls found in this date range. Try a wider period."); return; }

    setError(null);
    setGenerating(true);

    try {
      // Use Pacific date (not raw UTC slice) to match the daily breakdown timezone
      const periodCalls = calls.filter((c) => {
        if (!c.start_time) return false;
        const d = dateToPacificStr(new Date(c.start_time));
        return d >= from && d <= to;
      });

      const snapshot = buildReportSnapshot(periodCalls, from, to);

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          periodStart: from,
          periodEnd: to,
          snapshot,
          priorReportId: priorId || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Generation failed. Check the server logs.");
        setGenerating(false);
        return;
      }

      onGenerated(json.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setGenerating(false);
    }
  };

  const canGenerate = !generating && !!title.trim() && !!from && !!to && from <= to;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !generating) onClose(); }}
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-foreground">Generate Report</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI-written weekly summary saved to your account.</p>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-1 rounded-lg hover:bg-muted cursor-pointer disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title</label>
          <input
            ref={titleRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canGenerate) handleGenerate(); }}
            placeholder="e.g. Week of Apr 7 – Apr 13"
            className="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-[oklch(0.56_0.23_275_/_0.4)] transition"
          />
        </div>

        {/* Date range */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Period</label>
            {/* Live summary pill */}
            {rangeLabel && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md"
                style={{ background: "oklch(0.56 0.23 275 / 0.08)", color: "oklch(0.56 0.23 275)", border: "1px solid oklch(0.56 0.23 275 / 0.2)" }}>
                {rangeLabel} · {rangeCount.toLocaleString()} calls
              </span>
            )}
          </div>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_RANGES.map((qr) => {
              const qFrom = qr.from();
              const qTo = qr.to();
              const active = from === qFrom && to === qTo;
              return (
                <button
                  key={qr.label}
                  onClick={() => handleQuick(qr.from, qr.to)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-all cursor-pointer"
                  style={active ? {
                    background: "oklch(0.56 0.23 275 / 0.1)",
                    borderColor: "oklch(0.56 0.23 275 / 0.4)",
                    color: "oklch(0.56 0.23 275)",
                    fontWeight: 600,
                  } : {
                    background: "var(--muted)",
                    borderColor: "var(--border)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  {qr.label}
                </button>
              );
            })}
          </div>

          {/* Date inputs row */}
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide">From</span>
              <input
                type="date"
                value={from}
                min={MIN_DATE}
                max={to || today}
                onChange={(e) => handleFromChange(e.target.value)}
                className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-[oklch(0.56_0.23_275_/_0.4)] transition"
              />
            </div>

            {/* Arrow */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-muted-foreground/30 mt-4 shrink-0">
              <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>

            <div className="flex-1 space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wide">To</span>
              <input
                ref={toRef}
                type="date"
                value={to}
                min={from || MIN_DATE}
                max={today}
                onChange={(e) => handleToChange(e.target.value)}
                className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-[oklch(0.56_0.23_275_/_0.4)] transition"
              />
            </div>
          </div>

          {/* Zero-calls warning */}
          {from && to && from <= to && rangeCount === 0 && (
            <p className="text-[11px] text-amber-600 font-medium">
              No calls found in this range — try a different period.
            </p>
          )}
        </div>

        {/* Compare with prior */}
        {existingReports.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Compare with (optional)
            </label>
            <select
              value={priorId}
              onChange={(e) => setPriorId(e.target.value)}
              className="w-full text-xs bg-muted border border-border rounded-lg px-2.5 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-[oklch(0.56_0.23_275_/_0.4)] transition appearance-none cursor-pointer"
            >
              <option value="">None</option>
              {existingReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({fmtDate(r.period_start)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 font-medium">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={generating}
            className="flex-1 text-sm font-medium py-2 rounded-xl border border-border bg-muted text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground transition-all cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex-1 text-sm font-semibold py-2 rounded-xl text-white transition-all cursor-pointer disabled:opacity-40"
            style={{ background: "oklch(0.56 0.23 275)", boxShadow: "0 1px 3px oklch(0.56 0.23 275 / 0.35)" }}
          >
            {generating ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Generating…
              </span>
            ) : (
              "Generate Report"
            )}
          </button>
        </div>

        {generating && (
          <p className="text-[11px] text-center text-muted-foreground/50">
            Building snapshot and writing narrative — usually 10–20s.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function ReportsPanel({ calls }: { calls: CallRecord[] }) {
  const router = useRouter();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch("/api/reports");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load reports");
      setReports(json.reports ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleGenerated = (id: string) => {
    setShowDialog(false);
    router.push(`/reports/${id}`);
  };

  return (
    <div className="space-y-4">

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground">Reports</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {reports.length > 0
              ? `${reports.length} saved report${reports.length !== 1 ? "s" : ""}`
              : "Weekly & bi-weekly performance summaries"}
          </p>
        </div>
        <button
          onClick={() => setShowDialog(true)}
          className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl text-white cursor-pointer transition-all hover:opacity-90"
          style={{ background: "oklch(0.56 0.23 275)", boxShadow: "0 1px 3px oklch(0.56 0.23 275 / 0.3)" }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          New Report
        </button>
      </div>

      {/* Content */}
      {loadingList ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground/40">
          <span className="w-4 h-4 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/50 animate-spin" />
          <span className="text-xs font-mono">Loading reports…</span>
        </div>
      ) : listError ? (
        <div className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {listError} —{" "}
          <button onClick={fetchReports} className="underline cursor-pointer hover:no-underline">
            retry
          </button>
        </div>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} report={r} onOpen={(id) => router.push(`/reports/${id}`)} />
          ))}
        </div>
      )}

      {/* Generate dialog */}
      {showDialog && (
        <GenerateDialog
          calls={calls}
          existingReports={reports}
          onClose={() => setShowDialog(false)}
          onGenerated={handleGenerated}
        />
      )}
    </div>
  );
}
