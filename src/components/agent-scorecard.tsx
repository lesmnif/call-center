"use client";

import { useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ArrowLeft, Calendar, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { type CallRecord } from "@/lib/supabase";
import { DEFAULT_WINDOW_DAYS } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CallDetail } from "./call-detail";
import { TZ, todayPacific, dateToPacificStr } from "@/lib/timezone";
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
  calls: CallRecord[];
  totalDuration: number;
  avgDuration: number;
  salesPerDay: number;
  revenuePerHour: number;
  revenuePerCall: number;
  lowSample: boolean;
};

const MIN_CALLS_THRESHOLD = 5;

type SortKey =
  | "name"
  | "callsHandled"
  | "compositeIndex"
  | "salesClosed"
  | "revenue"
  | "conversionRate"
  | "totalDuration"
  | "salesPerDay"
  | "revenuePerHour"
  | "revenuePerCall";

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
  "Conv %": "Sales closed / sales opportunities",
  Duration: "Total time on calls (avg per call)",
  "Sales/Day": "Average sales closed per active day",
  "$/hr": "Revenue generated per hour on calls",
  "$/call": "Average revenue per call handled",
};

type AgentDateRange = "all" | "today" | "yesterday" | "3d" | "5d" | "custom";

const DATE_PRESETS: { value: AgentDateRange; label: string }[] = [
  { value: "all",       label: `Last ${DEFAULT_WINDOW_DAYS} days` },
  { value: "today",     label: "Today"      },
  { value: "yesterday", label: "Yesterday"  },
  { value: "3d",        label: "3 days"     },
  { value: "5d",        label: "5 days"     },
];

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const QUICK_RANGES = [
  { label: "Last 7d",    key: "7d"        },
  { label: "Last 14d",   key: "14d"       },
  { label: "This month", key: "month"     },
  { label: "Last month", key: "lastmonth" },
];

function getQuickRange(key: string): { from: string; to: string } {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const [y, m] = todayStr.split("-").map(Number);
  if (key === "7d")  return { from: new Date(Date.now() -  6 * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ }), to: todayStr };
  if (key === "14d") return { from: new Date(Date.now() - 13 * 86_400_000).toLocaleDateString("en-CA", { timeZone: TZ }), to: todayStr };
  if (key === "month") return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: todayStr };
  if (key === "lastmonth") {
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const lastDay = new Date(y, m - 1, 0).toLocaleDateString("en-CA", { timeZone: TZ });
    return { from: `${prevY}-${String(prevM).padStart(2, "0")}-01`, to: lastDay };
  }
  return { from: "", to: "" };
}

function filterCallsByDate(calls: CallRecord[], range: AgentDateRange, customFrom = "", customTo = ""): CallRecord[] {
  if (range === "all") return calls;
  return calls.filter((c) => {
    if (!c.start_time) return false;
    const pacificDate = dateToPacificStr(new Date(c.start_time));
    if (range === "today") return pacificDate === todayPacific();
    if (range === "yesterday") return pacificDate === dateToPacificStr(new Date(Date.now() - 86_400_000));
    if (range === "custom") {
      if (customFrom && pacificDate < customFrom) return false;
      if (customTo   && pacificDate > customTo)   return false;
      return true;
    }
    const days = range === "3d" ? 3 : 5;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    return c.start_time >= cutoff;
  });
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function needsCoaching(agent: AgentRow): boolean {
  if (agent.callsHandled === 0) return false;
  return agent.avgEfficiency < 3 || agent.avgCommunication < 3 || agent.avgResolution < 3;
}

function buildAgentRows(calls: CallRecord[]): AgentRow[] {
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

    const salesClosed = agentCalls.filter((c) => c.sale_completed).length;
    const upsells = agentCalls.filter((c) => c.upsell_attempted).length;
    const missedUpsells = agentCalls.filter((c) => c.upsell_opportunities && !c.upsell_attempted).length;
    const revenue = agentCalls.reduce((sum, c) => sum + (c.revenue ?? 0), 0);
    const opportunities = agentCalls.filter((c) => c.had_sales_opportunity).length;
    const convRate = opportunities > 0 ? salesClosed / opportunities : 0;

    const withDuration = agentCalls.filter(c => c.duration_seconds != null);
    const totalDuration = withDuration.reduce((s, c) => s + c.duration_seconds!, 0);
    const avgDur = withDuration.length > 0 ? Math.round(totalDuration / withDuration.length) : 0;

    const activeDays = new Set(agentCalls.map(c => c.start_time?.slice(0, 10)).filter(Boolean));
    const salesPerDay = activeDays.size > 0 ? salesClosed / activeDays.size : 0;

    const totalHours = totalDuration / 3600;
    const revenuePerHour = totalHours > 0 ? revenue / totalHours : 0;
    const revenuePerCall = agentCalls.length > 0 ? revenue / agentCalls.length : 0;

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
      calls: agentCalls,
      totalDuration,
      avgDuration: avgDur,
      salesPerDay,
      revenuePerHour,
      revenuePerCall,
      lowSample: agentCalls.length < MIN_CALLS_THRESHOLD,
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

function formatDurationHours(seconds: number): string {
  if (seconds === 0) return "—";
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

function ConversionPill({ rate, opportunities }: { rate: number; opportunities: number }) {
  if (opportunities === 0) return <span className="text-muted-foreground/30 text-xs">—</span>;
  const pct = Math.round(rate * 100);
  const color =
    pct >= 60 ? "oklch(0.59 0.17 148)" : pct >= 35 ? "oklch(0.60 0.17 60)" : "oklch(0.56 0.21 20)";
  const bg =
    pct >= 60 ? "oklch(0.59 0.17 148 / 0.1)" : pct >= 35 ? "oklch(0.60 0.17 60 / 0.1)" : "oklch(0.56 0.21 20 / 0.1)";
  return (
    <span
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold tabular-nums"
      style={{ color, background: bg }}
    >
      {pct}%
    </span>
  );
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

  // Daily breakdown: group calls by day
  const dailyBreakdown = useMemo(() => {
    const byDay = new Map<string, CallRecord[]>();
    for (const c of agent.calls) {
      if (!c.start_time) continue;
      const day = dateToPacificStr(new Date(c.start_time));
      const list = byDay.get(day) ?? [];
      list.push(c);
      byDay.set(day, list);
    }
    // Sort newest first
    return Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, calls]) => {
        const totalDur = calls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
        const revenue = calls.reduce((s, c) => s + (c.revenue ?? 0), 0);
        const sales = calls.filter(c => c.sale_completed).length;
        const hours = totalDur / 3600;
        const perHour = hours > 0 ? revenue / hours : 0;
        const d = new Date(day + "T12:00:00");
        const today = todayPacific();
        const yesterday = dateToPacificStr(new Date(Date.now() - 86_400_000));
        const label = day === today ? "Today"
          : day === yesterday ? "Yesterday"
          : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        return { day, label, calls: calls.length, sales, revenue, duration: totalDur, perHour };
      });
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
        {agent.lowSample && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-muted text-muted-foreground/60 border border-border">
            Low sample
          </span>
        )}
        {needsCoaching(agent) && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
            Coach
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard label="Revenue" value={agent.revenue > 0 ? `$${agent.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"} sub={`${agent.salesClosed} sales closed`} />
        <SummaryCard label="$/hr" value={agent.revenuePerHour > 0 ? `$${Math.round(agent.revenuePerHour).toLocaleString()}` : "—"} sub="revenue per hour on calls" />
        <SummaryCard label="$/call" value={agent.revenuePerCall > 0 ? `$${agent.revenuePerCall.toFixed(2)}` : "—"} sub="avg revenue per call" />
        <SummaryCard label="Conversion" value={agent.opportunities > 0 ? `${Math.round(agent.conversionRate * 100)}%` : "—"} sub={`${agent.salesClosed}/${agent.opportunities} opportunities`} />
        <SummaryCard label="Composite Index" value={agent.compositeIndex > 0 ? agent.compositeIndex.toFixed(1) : "—"} sub="Eff / Comm / Res" />
        <SummaryCard label="Sales / Day" value={agent.salesPerDay > 0 ? agent.salesPerDay.toFixed(1) : "—"} sub="avg per active day" />
        <SummaryCard label="Total Duration" value={agent.totalDuration > 0 ? formatDurationHours(agent.totalDuration) : "—"} sub={agent.avgDuration > 0 ? `~${formatDuration(agent.avgDuration)} avg/call` : undefined} />
        <SummaryCard label="Upsells" value={`${agent.upsellsAttempted} attempted`} sub={agent.missedUpsells > 0 ? `${agent.missedUpsells} missed` : undefined} />
      </div>

      {/* Daily Breakdown + Revenue chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Daily Breakdown */}
        {dailyBreakdown.length > 0 && (
          <div className="bg-card rounded-xl card-elevated p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60 mb-3">Daily Breakdown</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Day</span></th>
                    <th className="text-right py-2 px-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Calls</span></th>
                    <th className="text-right py-2 px-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Sales</span></th>
                    <th className="text-right py-2 px-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Revenue</span></th>
                    <th className="text-right py-2 px-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">Hours</span></th>
                    <th className="text-right py-2 pl-2"><span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">$/hr</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {dailyBreakdown.map((row) => (
                    <tr key={row.day}>
                      <td className="py-2 pr-3">
                        <span className={cn(
                          "text-[12px] font-medium",
                          row.label === "Today" ? "text-primary" : "text-foreground/80"
                        )}>
                          {row.label}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className="text-[12px] font-mono tabular-nums text-foreground/70">{row.calls}</span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className="text-[12px] font-mono tabular-nums text-foreground/70">{row.sales}</span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                          {row.revenue > 0 ? `$${row.revenue.toFixed(2)}` : "—"}
                        </span>
                      </td>
                      <td className="text-right py-2 px-2">
                        <span className="text-[12px] font-mono tabular-nums text-muted-foreground/60">
                          {formatDurationHours(row.duration)}
                        </span>
                      </td>
                      <td className="text-right py-2 pl-2">
                        <span className={cn(
                          "text-[12px] font-mono tabular-nums font-semibold",
                          row.perHour >= 200 ? "text-[oklch(0.59_0.17_148)]" : row.perHour > 0 ? "text-foreground/70" : "text-muted-foreground/30"
                        )}>
                          {row.perHour > 0 ? `$${Math.round(row.perHour)}` : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Revenue Per Call chart */}
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
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </div>

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
                <div className="self-stretch" style={{ background: accentColor }} />

                <div className="px-3 py-3.5 flex flex-col gap-0.5">
                  <span className="text-[11px] font-mono text-muted-foreground/70 leading-none">{dateStr}</span>
                  {timeStr && <span className="text-[10px] font-mono text-muted-foreground/40 leading-none">{timeStr}</span>}
                  {c.duration_seconds != null && (
                    <span className="text-[9px] font-mono text-muted-foreground/30 leading-none">
                      {Math.floor(c.duration_seconds / 60)}:{(c.duration_seconds % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </div>

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

                <div className="px-3 text-center">
                  <ScorePill value={composite} />
                </div>

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
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<AgentDateRange>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const filteredCalls = useMemo(
    () => filterCallsByDate(calls, dateRange, customFrom, customTo),
    [calls, dateRange, customFrom, customTo]
  );
  const agents = useMemo(() => buildAgentRows(filteredCalls), [filteredCalls]);

  // Sort: low-sample agents always go to bottom regardless of sort
  const sorted = useMemo(() => {
    return [...agents].sort((a, b) => {
      // Low sample agents sink to bottom
      if (a.lowSample !== b.lowSample) return a.lowSample ? 1 : -1;
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      const cmp = typeof aVal === "string" ? (aVal as string).localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [agents, sortKey, sortDir]);

  const selectedRow = selectedAgent ? agents.find((a) => a.name === selectedAgent) : null;

  // Summary stats — only from agents with enough calls
  const reliableAgents = useMemo(() => agents.filter(a => !a.lowSample), [agents]);

  const topSeller = useMemo(() => [...reliableAgents].sort((a, b) => b.revenue - a.revenue)[0], [reliableAgents]);
  const bestPerHour = useMemo(() => [...reliableAgents].filter(a => a.revenuePerHour > 0).sort((a, b) => b.revenuePerHour - a.revenuePerHour)[0], [reliableAgents]);
  const mostCalls = useMemo(() => [...reliableAgents].sort((a, b) => b.callsHandled - a.callsHandled)[0], [reliableAgents]);

  const totalOpps = reliableAgents.reduce((s, a) => s + a.opportunities, 0);
  const totalSales = reliableAgents.reduce((s, a) => s + a.salesClosed, 0);
  const overallConversion = totalOpps > 0 ? Math.round((totalSales / totalOpps) * 100) : 0;

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "desc") setSortDir("asc");
      else { setSortKey("revenue"); setSortDir("desc"); }
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
    { key: "salesClosed", label: "Sales", align: "right" },
    { key: "revenue", label: "Revenue", align: "right" },
    { key: "revenuePerHour", label: "$/hr", align: "right" },
    { key: "revenuePerCall", label: "$/call", align: "right" },
    { key: "conversionRate", label: "Conv %", align: "center" },
    { key: "totalDuration", label: "Duration", align: "right" },
    { key: "salesPerDay", label: "Sales/Day", align: "right" },
  ];

  return (
    <TooltipProvider>
      <div className="space-y-4">

        {/* Date range filter */}
        <div className="flex items-center gap-1 flex-wrap">
          {DATE_PRESETS.map((d) => {
            const isActive = dateRange === d.value;
            return (
              <button
                key={d.value}
                onClick={() => setDateRange(d.value)}
                className={`h-8 px-3 text-xs rounded-lg border cursor-pointer transition-all ${
                  isActive
                    ? "bg-primary/8 border-primary/30 text-primary font-medium"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {d.label}
              </button>
            );
          })}

          {/* Custom date range */}
          <Popover>
            <PopoverTrigger
              onClick={() => setDateRange("custom")}
              className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-all cursor-pointer select-none ${
                dateRange === "custom"
                  ? "bg-primary/8 border-primary/30 text-primary font-medium"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              <Calendar className="w-3 h-3 opacity-60 shrink-0" />
              {dateRange === "custom" && (customFrom || customTo) ? (
                <>
                  {customFrom ? fmtDate(customFrom) : "…"}
                  {" – "}
                  {customTo ? fmtDate(customTo) : "…"}
                  <span className="font-mono text-[9px] opacity-55 ml-0.5">· {filteredCalls.length.toLocaleString()}</span>
                </>
              ) : "Custom"}
              {dateRange === "custom" && (customFrom || customTo) && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); setCustomFrom(""); setCustomTo(""); setDateRange("all"); }}
                  className="ml-0.5 rounded hover:bg-primary/15 p-0.5 -mr-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-3 space-y-3">
              {/* Quick range chips */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 mb-1.5">Quick select</p>
                <div className="flex flex-wrap gap-1">
                  {QUICK_RANGES.map(({ label, key }) => {
                    const r = getQuickRange(key);
                    const isActive = customFrom === r.from && customTo === r.to;
                    return (
                      <button
                        key={key}
                        onClick={() => { setCustomFrom(r.from); setCustomTo(r.to); setDateRange("custom"); }}
                        className={`h-6 px-2 text-[10px] rounded-md border cursor-pointer transition-all ${
                          isActive
                            ? "bg-primary/8 border-primary/30 text-primary font-semibold"
                            : "border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:border-border/80"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Date inputs */}
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 block">From</label>
                  <input
                    type="date"
                    value={customFrom}
                    max={customTo || undefined}
                    onChange={(e) => { setCustomFrom(e.target.value); setDateRange("custom"); }}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 block">To</label>
                  <input
                    type="date"
                    value={customTo}
                    min={customFrom || undefined}
                    onChange={(e) => { setCustomTo(e.target.value); setDateRange("custom"); }}
                    className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>

              {/* Live count */}
              {(customFrom || customTo) && (
                <p className="text-[10px] font-mono text-muted-foreground/50 text-right tabular-nums pt-0.5">
                  {filteredCalls.length.toLocaleString()} call{filteredCalls.length !== 1 ? "s" : ""} in range
                </p>
              )}
            </PopoverContent>
          </Popover>

          {dateRange !== "all" && (
            <span className="text-[11px] font-mono text-muted-foreground/40 ml-2">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} · {filteredCalls.filter(c => c.status === "done").length} calls
            </span>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Top Seller"
            value={topSeller?.name.split(" ").slice(0, 2).join(" ") ?? "—"}
            sub={topSeller?.revenue ? `$${topSeller.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : undefined}
          />
          <SummaryCard
            label="Best $/hr"
            value={bestPerHour?.name.split(" ").slice(0, 2).join(" ") ?? "—"}
            sub={bestPerHour ? `$${Math.round(bestPerHour.revenuePerHour).toLocaleString()}/hr` : undefined}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {sorted.map((agent, i) => (
                  <tr
                    key={agent.name}
                    onClick={() => setSelectedAgent(agent.name)}
                    className={cn(
                      "cursor-pointer hover:bg-muted/30 transition-colors",
                      agent.lowSample && "opacity-50"
                    )}
                  >
                    <td className="px-3 py-3">
                      <span className="text-[11px] font-mono text-muted-foreground/40">{i + 1}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-foreground/85">
                          {agent.name.split(" ").slice(0, 2).join(" ")}
                        </span>
                        {agent.lowSample && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-muted text-muted-foreground/50 border border-border leading-none">
                            Low sample
                          </span>
                        )}
                        {needsCoaching(agent) && !agent.lowSample && (
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
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">{agent.salesClosed}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.revenue > 0 ? `$${agent.revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.revenuePerHour > 0 ? `$${Math.round(agent.revenuePerHour).toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.revenuePerCall > 0 ? `$${agent.revenuePerCall.toFixed(2)}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <ConversionPill rate={agent.conversionRate} opportunities={agent.opportunities} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                          {agent.totalDuration > 0 ? formatDurationHours(agent.totalDuration) : "—"}
                        </span>
                        {agent.avgDuration > 0 && (
                          <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40">
                            ~{formatDuration(agent.avgDuration)}/call
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="text-[12px] font-mono tabular-nums text-foreground/70">
                        {agent.salesPerDay > 0 ? agent.salesPerDay.toFixed(1) : "—"}
                      </span>
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
