"use client";

import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowLeft } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { type CallRecord } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { CallDetail } from "./call-detail";
import { TZ } from "@/lib/timezone";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Props = {
  calls: CallRecord[];
  onProcess?: (recordingId: number) => void;
};

type AgentRow = {
  name: string;
  callsHandled: number;
  compositeIndex: number;
  avgEfficiency: number;
  avgCommunication: number;
  avgResolution: number;
  salesClosed: number;
  upsellsAttempted: number;
  missedUpsells: number;
  revenue: number;
  conversionRate: number;
  opportunities: number;
  sparklineData: number[];
  calls: CallRecord[];
};

type SortKey =
  | "name"
  | "callsHandled"
  | "compositeIndex"
  | "avgEfficiency"
  | "avgCommunication"
  | "avgResolution"
  | "salesClosed"
  | "upsellsAttempted"
  | "revenue"
  | "missedUpsells"
  | "conversionRate";

type SortDir = "asc" | "desc";

const SCORE_RUBRIC: Record<string, { title: string; anchors: [string, string, string] }> = {
  Efficiency: {
    title: "Call pacing & task focus",
    anchors: ["No wasted time, wrapped up cleanly", "Some dead air/tangents, task completed", "Chaotic, major portions off-task"],
  },
  Comm: {
    title: "Greeting, clarity & product knowledge",
    anchors: ["Warm greeting, used name, product expertise", "Generic greeting, limited product knowledge", "Rude, incoherent, or unprepared"],
  },
  Resolution: {
    title: "Problem solving & resolution",
    anchors: ["Fully resolved, customer confirmed", "Partial — customer may need to call back", "No meaningful progress on the issue"],
  },
};

const COLUMN_TOOLTIPS: Record<string, string> = {
  Index: "Average of Efficiency + Communication + Resolution (out of 5)",
  Calls: "Calls with full performance scoring",
  Sales: "Calls where a sale was completed",
  Revenue: "Total revenue from completed sales",
  "Missed": "Calls with upsell opportunities that weren't attempted",
  "Conv %": "Sales closed / sales opportunities",
  Trend: "Composite score trend for the last 10 scored calls",
};

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function needsCoaching(agent: AgentRow): boolean {
  if (agent.callsHandled === 0) return false;
  return agent.avgEfficiency < 3 || agent.avgCommunication < 3 || agent.avgResolution < 3;
}

function buildAgentRows(calls: CallRecord[]): AgentRow[] {
  // Only use calls that have all 3 performance scores — these are the "new" calls
  const scored = calls.filter(
    (c) => c.agent_name && c.status === "done" &&
      c.efficiency_score != null && c.communication_score != null && c.resolution_score != null
  );

  const byAgent = new Map<string, CallRecord[]>();
  for (const c of scored) {
    const name = c.agent_name!;
    const list = byAgent.get(name) ?? [];
    list.push(c);
    byAgent.set(name, list);
  }

  const rows: AgentRow[] = [];
  for (const [name, agentCalls] of byAgent) {
    const avgEff = avg(agentCalls.map((c) => c.efficiency_score!));
    const avgComm = avg(agentCalls.map((c) => c.communication_score!));
    const avgRes = avg(agentCalls.map((c) => c.resolution_score!));
    const composite = (avgEff + avgComm + avgRes) / 3;

    // Sparkline: last 10 composite scores sorted chronologically
    const chronological = [...agentCalls].sort(
      (a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? "")
    );
    const last10 = chronological.slice(-10);
    const sparklineData = last10.map(
      (c) => (c.efficiency_score! + c.communication_score! + c.resolution_score!) / 3
    );

    const salesClosed = agentCalls.filter((c) => c.sale_completed).length;
    const upsells = agentCalls.filter((c) => c.upsell_attempted).length;
    const missedUpsells = agentCalls.filter((c) => c.upsell_opportunities && !c.upsell_attempted).length;
    const revenue = agentCalls.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const opportunities = agentCalls.filter((c) => c.had_sales_opportunity).length;
    const convRate = opportunities > 0 ? salesClosed / opportunities : 0;

    rows.push({
      name,
      callsHandled: agentCalls.length,
      compositeIndex: composite,
      avgEfficiency: avgEff,
      avgCommunication: avgComm,
      avgResolution: avgRes,
      salesClosed,
      upsellsAttempted: upsells,
      missedUpsells,
      revenue,
      conversionRate: convRate,
      opportunities,
      sparklineData,
      calls: agentCalls,
    });
  }

  return rows;
}

function ScorePill({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground/30 text-xs">—</span>;
  const color =
    value >= 4 ? "oklch(0.59 0.17 148)" : value >= 3 ? "oklch(0.60 0.17 60)" : "oklch(0.56 0.21 20)";
  const bg =
    value >= 4 ? "oklch(0.59 0.17 148 / 0.1)" : value >= 3 ? "oklch(0.60 0.17 60 / 0.1)" : "oklch(0.56 0.21 20 / 0.1)";
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums"
      style={{ color, background: bg }}
    >
      {value.toFixed(1)}
    </span>
  );
}

function SparkLine({ data }: { data: number[] }) {
  if (data.length < 2) return <span className="text-muted-foreground/30 text-xs">—</span>;
  const w = 52;
  const h = 20;
  const pad = 2;
  const min = 0;
  const max = 5;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const lastVal = data[data.length - 1];
  const color = lastVal >= 4 ? "oklch(0.59 0.17 148)" : lastVal >= 3 ? "oklch(0.60 0.17 60)" : "oklch(0.56 0.21 20)";
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "asc" ? <ChevronUp className="w-3 h-3 opacity-70" /> : <ChevronDown className="w-3 h-3 opacity-70" />;
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl card-elevated p-5 flex flex-col gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">{label}</p>
      <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground/50 font-mono">{sub}</p>}
    </div>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function RubricContent({ rubric }: { rubric: { title: string; anchors: [string, string, string] } }) {
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-background">{rubric.title}</p>
      <div className="space-y-1 text-background/70">
        <div className="flex gap-2"><span className="font-mono font-semibold text-background/90 shrink-0">5</span><span>{rubric.anchors[0]}</span></div>
        <div className="flex gap-2"><span className="font-mono font-semibold text-background/90 shrink-0">3</span><span>{rubric.anchors[1]}</span></div>
        <div className="flex gap-2"><span className="font-mono font-semibold text-background/90 shrink-0">1</span><span>{rubric.anchors[2]}</span></div>
      </div>
    </div>
  );
}

function ColumnHeader({ label, tooltip }: { label: string; tooltip?: string }) {
  const rubric = SCORE_RUBRIC[label];
  const hasTooltip = rubric || tooltip;
  if (!hasTooltip) return <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">{label}</span>;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 cursor-help" />}
      >
        {label}
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px] text-xs leading-relaxed">
        {rubric ? <RubricContent rubric={rubric} /> : tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// Chart configs
const scoresChartConfig: ChartConfig = {
  composite: { label: "Composite", color: "oklch(0.56 0.23 275)" },
  efficiency: { label: "Efficiency", color: "oklch(0.59 0.17 148)" },
  communication: { label: "Communication", color: "oklch(0.60 0.17 60)" },
  resolution: { label: "Resolution", color: "oklch(0.56 0.21 20)" },
};

const revenueChartConfig: ChartConfig = {
  revenue: { label: "Revenue", color: "oklch(0.56 0.23 275)" },
};

type SalesFilter = "all" | "has_sale" | "opportunity" | "missed_upsell" | "upsell_attempted" | "no_opportunity";

const SALES_FILTERS: { value: SalesFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "has_sale", label: "Has Sale" },
  { value: "opportunity", label: "Opportunity" },
  { value: "missed_upsell", label: "Missed Upsell" },
  { value: "upsell_attempted", label: "Upsell Attempted" },
  { value: "no_opportunity", label: "No Opportunity" },
];

function filterBySales(calls: CallRecord[], filter: SalesFilter): CallRecord[] {
  if (filter === "all") return calls;
  return calls.filter((c) => {
    if (filter === "has_sale") return c.revenue != null && c.revenue > 0;
    if (filter === "opportunity") return c.had_sales_opportunity;
    if (filter === "missed_upsell") return !!(c.upsell_opportunities && !c.upsell_attempted);
    if (filter === "upsell_attempted") return c.upsell_attempted;
    if (filter === "no_opportunity") return !c.had_sales_opportunity;
    return true;
  });
}

function AgentDetail({
  agent,
  onBack,
  onProcess,
}: {
  agent: AgentRow;
  onBack: () => void;
  onProcess?: (recordingId: number) => void;
}) {
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("all");

  const sortedCalls = useMemo(
    () => filterBySales(
      [...agent.calls].sort((a, b) => (b.start_time ?? "").localeCompare(a.start_time ?? "")),
      salesFilter
    ),
    [agent.calls, salesFilter]
  );

  // Chart data: scores over time
  const scoresData = useMemo(() => {
    const scored = agent.calls
      .filter((c) => c.efficiency_score != null && c.communication_score != null && c.resolution_score != null)
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
    return scored.map((c) => ({
      date: c.start_time
        ? new Date(c.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
        : "?",
      composite: +((c.efficiency_score! + c.communication_score! + c.resolution_score!) / 3).toFixed(2),
      efficiency: c.efficiency_score!,
      communication: c.communication_score!,
      resolution: c.resolution_score!,
    }));
  }, [agent.calls]);

  // Chart data: revenue per call
  const revenueData = useMemo(() => {
    return agent.calls
      .filter((c) => c.revenue != null && c.revenue > 0)
      .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
      .map((c) => ({
        date: c.start_time
          ? new Date(c.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
          : "?",
        revenue: c.revenue!,
      }));
  }, [agent.calls]);

  return (
    <TooltipProvider>
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to rankings
      </button>

      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-bold text-foreground">{agent.name}</h2>
        <span className="text-xs font-mono text-muted-foreground/50">{agent.callsHandled} calls</span>
        {needsCoaching(agent) && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
            Coach
          </span>
        )}
      </div>

      {/* Scores row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Composite Index" value={agent.compositeIndex > 0 ? agent.compositeIndex.toFixed(1) : "—"} sub="out of 5.0" />
        <SummaryCard label="Revenue" value={agent.revenue > 0 ? `$${agent.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"} sub={`${agent.salesClosed} sales closed`} />
        <SummaryCard label="Conversion Rate" value={agent.opportunities > 0 ? `${Math.round(agent.conversionRate * 100)}%` : "—"} sub={`${agent.salesClosed}/${agent.opportunities} opportunities`} />
        <SummaryCard label="Upsells Attempted" value={String(agent.upsellsAttempted)} />
      </div>

      {/* Charts: side by side */}
      {(scoresData.length > 1 || revenueData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {scoresData.length > 1 && (
            <div className="bg-card rounded-xl card-elevated p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60 mb-3">Scores Over Time</p>
              <ChartContainer config={scoresChartConfig} className="aspect-[2/1] w-full">
                <LineChart data={scoresData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="composite" stroke="var(--color-composite)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="efficiency" stroke="var(--color-efficiency)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="communication" stroke="var(--color-communication)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="resolution" stroke="var(--color-resolution)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ChartContainer>
            </div>
          )}
          {revenueData.length > 0 && (
            <div className="bg-card rounded-xl card-elevated p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60 mb-3">Revenue Per Call</p>
              <ChartContainer config={revenueChartConfig} className="aspect-[2/1] w-full">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `$${Number(value).toFixed(2)}`}
                      />
                    }
                  />
                  <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex items-center gap-1.5">
        {SALES_FILTERS.map((f) => {
          const isActive = salesFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setSalesFilter(f.value)}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium border cursor-pointer transition-all ${
                isActive
                  ? "bg-primary/8 border-primary/30 text-primary"
                  : "border-border bg-card text-muted-foreground/60 hover:text-muted-foreground hover:border-border/80"
              }`}
            >
              {f.label}
            </button>
          );
        })}
        {salesFilter !== "all" && (
          <span className="text-[11px] font-mono text-muted-foreground/40 ml-1">
            {sortedCalls.length} of {agent.calls.length}
          </span>
        )}
      </div>

      {/* Calls table */}
      <div className="bg-card rounded-xl card-elevated overflow-hidden">
        <div className="grid grid-cols-[3px_88px_1fr_56px_100px] bg-muted/60 border-b border-border px-1">
          <div />
          <div className="px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Time</span>
          </div>
          <div className="px-4 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Summary</span>
          </div>
          <div className="px-3 py-2.5 text-center">
            <Tooltip>
              <TooltipTrigger
                render={<span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60 underline decoration-dotted decoration-muted-foreground/30 underline-offset-2 cursor-help" />}
              >
                Score
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs leading-relaxed">
                Average of Efficiency + Communication + Resolution
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="px-4 py-2.5 flex justify-end">
            <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Outcome</span>
          </div>
        </div>
        <div className="divide-y divide-border/60">
          {sortedCalls.map((c) => {
            const d = c.start_time ? new Date(c.start_time) : null;
            const dateStr = d
              ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ })
              : "—";
            const timeStr = d
              ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ })
              : "";
            const hasMissedUpsell = !!(c.upsell_opportunities && !c.upsell_attempted);
            const composite = (c.efficiency_score != null && c.communication_score != null && c.resolution_score != null)
              ? (c.efficiency_score + c.communication_score + c.resolution_score) / 3
              : 0;
            const sentimentKey = (c.sentiment ?? "") as "positive" | "negative" | "neutral";
            const sentimentColors: Record<string, { color: string; label: string }> = {
              positive: { color: "oklch(0.59 0.17 148)", label: "Positive" },
              negative: { color: "oklch(0.56 0.21 20)", label: "Negative" },
              neutral:  { color: "oklch(0.55 0.04 258)", label: "Neutral" },
            };
            const sentiment = sentimentColors[sentimentKey] ?? null;
            const outcomeLabels: Record<string, { color: string; label: string }> = {
              resolved:         { color: "oklch(0.59 0.17 148)", label: "Resolved" },
              follow_up_needed: { color: "oklch(0.60 0.17 60)",  label: "Follow-up" },
              escalated:        { color: "oklch(0.56 0.21 20)",  label: "Escalated" },
            };
            const outcome = outcomeLabels[c.outcome ?? ""] ?? null;
            const hasBadges = (c.revenue != null && c.revenue > 0) || c.upsell_attempted || hasMissedUpsell;

            // Left accent: green = sale, amber = opportunity (no sale), purple = upsell attempted, transparent = not a sales call
            const accentColor = (c.revenue != null && c.revenue > 0)
              ? "oklch(0.59 0.17 148)"
              : c.upsell_attempted
              ? "oklch(0.56 0.23 275)"
              : hasMissedUpsell
              ? "oklch(0.60 0.17 60)"
              : c.had_sales_opportunity
              ? "oklch(0.60 0.17 60 / 0.4)"
              : "transparent";

            return (
              <div
                key={c.recording_id}
                onClick={() => setSelectedCall(c)}
                className="grid grid-cols-[3px_88px_1fr_56px_100px] px-1 cursor-pointer hover:bg-muted/30 transition-colors items-center"
              >
                {/* Left accent strip */}
                <div className="self-stretch" style={{ background: accentColor }} />

                {/* Time */}
                <div className="px-3 py-3.5 flex flex-col gap-0.5">
                  <span className="text-[11px] font-mono text-muted-foreground/70 leading-none">{dateStr}</span>
                  {timeStr && <span className="text-[10px] font-mono text-muted-foreground/40 leading-none">{timeStr}</span>}
                  {c.duration_seconds != null && (
                    <span className="text-[9px] font-mono text-muted-foreground/30 leading-none">
                      {Math.floor(c.duration_seconds / 60)}:{(c.duration_seconds % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>

                {/* Summary + badges */}
                <div className="px-4 py-3.5 flex flex-col justify-center min-w-0 gap-1">
                  <p className="text-[12px] text-foreground/80 leading-relaxed line-clamp-2">{c.summary ?? "—"}</p>
                  {hasBadges && (
                    <div className="flex items-center gap-1.5">
                      {c.revenue != null && c.revenue > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ color: "oklch(0.46 0.17 148)", background: "oklch(0.59 0.17 148 / 0.1)" }}>
                          ${c.revenue.toFixed(2)}
                        </span>
                      )}
                      {c.upsell_attempted && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ color: "oklch(0.50 0.17 275)", background: "oklch(0.56 0.23 275 / 0.1)" }}>
                          Upsell
                        </span>
                      )}
                      {hasMissedUpsell && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ color: "oklch(0.55 0.17 60)", background: "oklch(0.60 0.17 60 / 0.1)" }}>
                          Missed Upsell
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Composite score */}
                <div className="px-3 text-center">
                  <ScorePill value={composite} />
                </div>

                {/* Outcome + sentiment */}
                <div className="px-4 py-3.5 flex flex-col items-end justify-center gap-1">
                  {outcome && (
                    <span className="text-[11px] font-semibold" style={{ color: outcome.color }}>
                      {outcome.label}
                    </span>
                  )}
                  {sentiment && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: sentiment.color }}>
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

      <CallDetail call={selectedCall} open={!!selectedCall} onClose={() => setSelectedCall(null)} onProcess={onProcess} />
    </div>
    </TooltipProvider>
  );
}

export function AgentScorecard({ calls, onProcess }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("compositeIndex");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const agents = useMemo(() => buildAgentRows(calls), [calls]);

  const sorted = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string" ? (aVal as string).localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [agents, sortKey, sortDir]);

  const selectedRow = selectedAgent ? agents.find((a) => a.name === selectedAgent) : null;

  // Summary stats
  const topSeller = useMemo(() => [...agents].sort((a, b) => b.revenue - a.revenue)[0], [agents]);
  const bestRated = useMemo(() => [...agents].filter((a) => a.compositeIndex > 0).sort((a, b) => b.compositeIndex - a.compositeIndex)[0], [agents]);
  const mostCalls = useMemo(() => [...agents].sort((a, b) => b.callsHandled - a.callsHandled)[0], [agents]);

  const totalOpps = agents.reduce((s, a) => s + a.opportunities, 0);
  const totalSales = agents.reduce((s, a) => s + a.salesClosed, 0);
  const overallConversion = totalOpps > 0 ? Math.round((totalSales / totalOpps) * 100) : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "desc") setSortDir("asc");
      else { setSortKey("compositeIndex"); setSortDir("desc"); }
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (selectedRow) {
    return <AgentDetail agent={selectedRow} onBack={() => setSelectedAgent(null)} onProcess={onProcess} />;
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center bg-card rounded-xl card-elevated">
        <p className="text-sm font-semibold text-muted-foreground">No agent data</p>
        <p className="text-xs font-mono text-muted-foreground/50">Processed calls with identified agents will appear here</p>
      </div>
    );
  }

  const columns: { key: SortKey; label: string; align?: "right" | "center" }[] = [
    { key: "name", label: "Agent" },
    { key: "callsHandled", label: "Calls", align: "right" },
    { key: "compositeIndex", label: "Index", align: "center" },
    { key: "avgEfficiency", label: "Efficiency", align: "center" },
    { key: "avgCommunication", label: "Comm", align: "center" },
    { key: "avgResolution", label: "Resolution", align: "center" },
    { key: "salesClosed", label: "Sales", align: "right" },
    { key: "revenue", label: "Revenue", align: "right" },
    { key: "missedUpsells", label: "Missed", align: "right" },
    { key: "conversionRate", label: "Conv %", align: "right" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Top Seller"
            value={topSeller?.name.split(" ").slice(0, 2).join(" ") ?? "—"}
            sub={topSeller?.revenue ? `$${topSeller.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : undefined}
          />
          <SummaryCard
            label="Best Rated"
            value={bestRated?.name.split(" ").slice(0, 2).join(" ") ?? "—"}
            sub={bestRated ? `${bestRated.compositeIndex.toFixed(1)} / 5.0` : undefined}
          />
          <SummaryCard
            label="Most Active"
            value={mostCalls?.name.split(" ").slice(0, 2).join(" ") ?? "—"}
            sub={mostCalls ? `${mostCalls.callsHandled} calls` : undefined}
          />
          <SummaryCard
            label="Overall Conversion"
            value={`${overallConversion}%`}
            sub={`${totalSales} of ${totalOpps} opportunities`}
          />
        </div>

        {/* Rankings table */}
        <div className="bg-card rounded-xl card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  <th className="w-8 px-3 py-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">#</span>
                  </th>
                  {columns.map((col) => (
                    <th key={col.key} className={cn("px-3 py-2.5", col.align === "right" && "text-right", col.align === "center" && "text-center")}>
                      <button
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-foreground/80 transition-colors group"
                      >
                        <ColumnHeader label={col.label} tooltip={COLUMN_TOOLTIPS[col.label]} />
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                  <th className="px-3 py-2.5">
                    <ColumnHeader label="Trend" tooltip={COLUMN_TOOLTIPS["Trend"]} />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sorted.map((agent, i) => (
                  <tr
                    key={agent.name}
                    onClick={() => setSelectedAgent(agent.name)}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <span className="text-[11px] font-mono text-muted-foreground/40">{i + 1}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-foreground/85">
                          {agent.name.split(" ").slice(0, 2).join(" ")}
                        </span>
                        {needsCoaching(agent) && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20 leading-none">
                            Coach
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">{agent.callsHandled}</span>
                    </td>
                    <td className="px-3 py-3 text-center"><ScorePill value={agent.compositeIndex} /></td>
                    <td className="px-3 py-3 text-center"><ScorePill value={agent.avgEfficiency} /></td>
                    <td className="px-3 py-3 text-center"><ScorePill value={agent.avgCommunication} /></td>
                    <td className="px-3 py-3 text-center"><ScorePill value={agent.avgResolution} /></td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">{agent.salesClosed}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.revenue > 0 ? `$${agent.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {agent.missedUpsells > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums"
                          style={{ color: "oklch(0.55 0.17 60)", background: "oklch(0.60 0.17 60 / 0.1)" }}>
                          {agent.missedUpsells}
                        </span>
                      ) : (
                        <span className="text-[12px] font-mono tabular-nums text-muted-foreground/30">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.opportunities > 0 ? `${Math.round(agent.conversionRate * 100)}%` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <SparkLine data={agent.sparklineData} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
