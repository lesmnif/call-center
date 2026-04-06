"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Cell, LabelList,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { type CallRecord } from "@/lib/supabase";
import {
  groupByPeriod,
  getHourPacific,
  getDayOfWeekPacific,
  computeAvgDuration,
  formatDur,
} from "@/lib/analytics-utils";
import { TZ } from "@/lib/timezone";
import { dateToPacificStr } from "@/lib/timezone";
import { DATA_QUALITY_CUTOFF } from "@/lib/constants";

const CUTOFF_LABEL = new Date(DATA_QUALITY_CUTOFF).toLocaleDateString("en-US", {
  month: "short", day: "numeric", timeZone: TZ,
});

type AnalyticsDateRange = "all" | "yesterday" | "3d" | "5d";
type Props = { calls: CallRecord[] };

const BRAND = "oklch(0.56 0.23 275)";
const GREEN = "oklch(0.59 0.17 148)";
const AMBER = "oklch(0.60 0.17 60)";
const RED   = "oklch(0.56 0.21 20)";
const SLATE = "oklch(0.55 0.04 258)";

const DAYS_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DATE_RANGES: { value: AnalyticsDateRange; label: string }[] = [
  { value: "all",       label: "All time"  },
  { value: "yesterday", label: "Yesterday" },
  { value: "3d",        label: "3 days"    },
  { value: "5d",        label: "5 days"    },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60 mb-3">
      {children}
    </h3>
  );
}

function StatLine({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] text-muted-foreground/50">{label}</span>
      <span className={`text-[13px] font-mono font-semibold tabular-nums ${accent ? "text-foreground" : "text-foreground/75"}`}>{value}</span>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-card rounded-xl card-elevated p-5 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60 mb-0.5">
        {title}
      </p>
      {subtitle && (
        <p className="text-[9px] text-muted-foreground/35 mb-3">{subtitle}</p>
      )}
      {!subtitle && <div className="mb-3" />}
      {children}
    </div>
  );
}

export function AnalyticsView({ calls }: Props) {
  const [dateRange, setDateRange] = useState<AnalyticsDateRange>("all");

  // ── Date range filter — affects time-series and breakdown charts only ─────
  const rangedCalls = useMemo(() => {
    if (dateRange === "all") return calls;
    if (dateRange === "yesterday") {
      const yesterday = dateToPacificStr(new Date(Date.now() - 86_400_000));
      return calls.filter(c => c.start_time && dateToPacificStr(new Date(c.start_time)) === yesterday);
    }
    const days = dateRange === "3d" ? 3 : 5;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    return calls.filter(c => c.start_time && c.start_time >= cutoff);
  }, [calls, dateRange]);

  // Processed calls within range — for AI-derived metrics
  const doneCalls = useMemo(() => rangedCalls.filter(c => c.status === "done"), [rangedCalls]);

  // ── Date range info — actual first/last date in each set ──────────────────
  const rangeInfo = useMemo(() => {
    if (rangedCalls.length === 0) return null;
    let maxTs = -Infinity;
    for (const c of rangedCalls) {
      if (!c.start_time) continue;
      const t = new Date(c.start_time).getTime();
      if (t > maxTs) maxTs = t;
    }
    if (!isFinite(maxTs)) return null;
    const toStr = (ts: number) =>
      new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
    const distinctDays = new Set(
      rangedCalls.filter(c => c.start_time).map(c =>
        new Date(c.start_time!).toLocaleDateString("en-CA", { timeZone: TZ })
      )
    ).size;
    // For "all time", anchor start to the cutoff so the display matches what the data boundary is
    const start = dateRange === "all" ? CUTOFF_LABEL : toStr(
      Math.min(...rangedCalls.filter(c => c.start_time).map(c => new Date(c.start_time!).getTime()))
    );
    const end = toStr(maxTs);
    return { start, end, days: distinctDays, label: start === end ? start : `${start} – ${end}` };
  }, [rangedCalls, dateRange]);

  const allDataInfo = useMemo(() => {
    if (calls.length === 0) return null;
    let maxTs = -Infinity;
    for (const c of calls) {
      if (!c.start_time) continue;
      const t = new Date(c.start_time).getTime();
      if (t > maxTs) maxTs = t;
    }
    if (!isFinite(maxTs)) return null;
    const toStr = (ts: number) =>
      new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
    const distinctDays = new Set(
      calls.filter(c => c.start_time).map(c =>
        new Date(c.start_time!).toLocaleDateString("en-CA", { timeZone: TZ })
      )
    ).size;
    // Always anchor start to the cutoff — pattern charts cover the full dataset from cutoff onward
    const start = CUTOFF_LABEL;
    const end = toStr(maxTs);
    return { start, end, days: distinctDays, label: start === end ? start : `${start} – ${end}` };
  }, [calls]);

  // ── PATTERN CHARTS — always use ALL quality calls, ignore date range ───────
  // Patterns only make sense with as much data as possible (peak hour, busiest weekday, etc.)
  const peakHours = useMemo(() => {
    const counts = new Array(24).fill(0);
    for (const c of calls) {
      const h = getHourPacific(c);
      if (h != null) counts[h]++;
    }
    return counts
      .map((count, hour) => ({ hour: `${hour.toString().padStart(2, "0")}:00`, calls: count }))
      .filter((_, i) => i >= 7 && i <= 22);
  }, [calls]);

  const dayOfWeek = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of DAYS_ORDER) counts[d] = 0;
    for (const c of calls) {
      const d = getDayOfWeekPacific(c);
      if (d && d in counts) counts[d]++;
    }
    return DAYS_ORDER.map(d => ({ day: d, calls: counts[d] }));
  }, [calls]);

  // ── TIME-SERIES — respect date range, always daily granularity ────────────
  // Volume: group by Pacific date, label as "Thu 19" for readability
  const volumeByDay = useMemo(() => {
    const countMap  = new Map<string, number>(); // dateKey "2026-03-19" → count
    const labelMap  = new Map<string, string>(); // dateKey → "Thu 19"
    for (const c of rangedCalls) {
      if (!c.start_time) continue;
      const d = new Date(c.start_time);
      const dateKey = d.toLocaleDateString("en-CA", { timeZone: TZ }); // "YYYY-MM-DD" for sorting
      const dayName = d.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
      const dayNum  = d.toLocaleDateString("en-US", { day: "numeric", timeZone: TZ });
      labelMap.set(dateKey, `${dayName} ${dayNum}`);
      countMap.set(dateKey, (countMap.get(dateKey) ?? 0) + 1);
    }
    return Array.from(countMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, calls]) => ({ label: labelMap.get(k)!, calls }));
  }, [rangedCalls]);

  const revenueOverTime = useMemo(() => {
    const grouped = groupByPeriod(doneCalls, "daily");
    return Array.from(grouped.entries()).map(([label, cs]) => ({
      label,
      revenue: cs.reduce((s, c) => s + (c.revenue ?? 0), 0),
    }));
  }, [doneCalls]);

  const conversionOverTime = useMemo(() => {
    const grouped = groupByPeriod(doneCalls, "daily");
    return Array.from(grouped.entries()).map(([label, cs]) => {
      const opps  = cs.filter(c => c.had_sales_opportunity).length;
      const sales = cs.filter(c => c.sale_completed).length;
      return { label, rate: opps > 0 ? Math.round((sales / opps) * 100) : 0 };
    });
  }, [doneCalls]);

  // ── Category & Order Type ─────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const c of doneCalls) {
      const cat = c.category ?? "Unknown";
      const entry = map.get(cat) ?? { count: 0, revenue: 0 };
      entry.count++;
      entry.revenue += c.revenue ?? 0;
      map.set(cat, entry);
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({ name: name.replace(/_/g, " "), ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [doneCalls]);

  const orderTypeData = useMemo(() => {
    const pickup   = doneCalls.filter(c => c.category === "order_pickup");
    const delivery = doneCalls.filter(c => c.category === "order_delivery" || c.category === "express_delivery");
    return [
      { type: "Pickup",   count: pickup.length,   revenue: pickup.reduce((s, c)   => s + (c.revenue ?? 0), 0) },
      { type: "Delivery", count: delivery.length,  revenue: delivery.reduce((s, c) => s + (c.revenue ?? 0), 0) },
    ];
  }, [doneCalls]);

  // ── Duration Analytics ────────────────────────────────────────────────────
  const durationByAgent = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    for (const c of rangedCalls) {
      if (!c.agent_name || c.duration_seconds == null) continue;
      const list = map.get(c.agent_name) ?? [];
      list.push(c);
      map.set(c.agent_name, list);
    }
    return Array.from(map.entries())
      .map(([agent, cs]) => ({ name: agent.split(" ").slice(0, 2).join(" "), avg: computeAvgDuration(cs) }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [rangedCalls]);

  const durationByCategory = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    for (const c of doneCalls) {
      if (!c.category || c.duration_seconds == null) continue;
      const list = map.get(c.category) ?? [];
      list.push(c);
      map.set(c.category, list);
    }
    return Array.from(map.entries())
      .filter(([, cs]) => cs.length >= 5) // min 5 calls — single-call averages are meaningless
      .map(([cat, cs]) => ({ name: cat.replace(/_/g, " "), avg: computeAvgDuration(cs), count: cs.length }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [doneCalls]);

  // ── Missed Opportunities ─────────────────────────────────────────────────
  const missedByAgent = useMemo(() => {
    const map = new Map<string, { opps: number; sales: number }>();
    for (const c of doneCalls) {
      if (!c.agent_name || !c.had_sales_opportunity) continue;
      const entry = map.get(c.agent_name) ?? { opps: 0, sales: 0 };
      entry.opps++;
      if (c.sale_completed) entry.sales++;
      map.set(c.agent_name, entry);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name: name.split(" ").slice(0, 2).join(" "),
        converted: d.sales,
        missed: d.opps - d.sales,
        total: d.opps,
        rate: Math.round((d.sales / d.opps) * 100),
      }))
      .sort((a, b) => b.total - a.total);
  }, [doneCalls]);

  // ── Agent Comparison ──────────────────────────────────────────────────────
  type AgentMetric = "score" | "revenue" | "calls" | "conversion";
  const [agentMetric, setAgentMetric] = useState<AgentMetric>("revenue");

  const agentComparison = useMemo(() => {
    const map = new Map<string, CallRecord[]>();
    for (const c of doneCalls) {
      if (!c.agent_name) continue;
      const list = map.get(c.agent_name) ?? [];
      list.push(c);
      map.set(c.agent_name, list);
    }
    return Array.from(map.entries())
      .map(([name, agentCalls]) => {
        const scored = agentCalls.filter(c => c.efficiency_score != null && c.communication_score != null && c.resolution_score != null);
        const avgScore = scored.length > 0
          ? scored.reduce((s, c) => s + (c.efficiency_score! + c.communication_score! + c.resolution_score!) / 3, 0) / scored.length
          : 0;
        const revenue    = agentCalls.reduce((s, c) => s + (c.revenue ?? 0), 0);
        const opps       = agentCalls.filter(c => c.had_sales_opportunity).length;
        const sales      = agentCalls.filter(c => c.sale_completed).length;
        const conversion = opps > 0 ? Math.round((sales / opps) * 100) : 0;
        return { name: name.split(" ").slice(0, 2).join(" "), score: +avgScore.toFixed(2), revenue, calls: agentCalls.length, conversion };
      })
      .sort((a, b) => b[agentMetric] - a[agentMetric]);
  }, [doneCalls, agentMetric]);

  // ── KPI Summary ───────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalCalls   = rangedCalls.length;
    const totalRevenue = doneCalls.reduce((s, c) => s + (c.revenue ?? 0), 0);
    const opps         = doneCalls.filter(c => c.had_sales_opportunity).length;
    const sales        = doneCalls.filter(c => c.sale_completed).length;
    const conversion   = opps > 0 ? Math.round((sales / opps) * 100) : null;
    const avgDur       = computeAvgDuration(rangedCalls.filter(c => c.duration_seconds != null));
    return { totalCalls, totalRevenue, conversion, avgDur, opps };
  }, [rangedCalls, doneCalls]);

  // Chart configs
  const volumeConfig: ChartConfig     = { calls:      { label: "Calls",         color: BRAND } };
  const revenueConfig: ChartConfig    = { revenue:    { label: "Revenue",        color: GREEN } };
  const conversionConfig: ChartConfig = { rate:       { label: "Conversion %",   color: BRAND } };
  const catConfig: ChartConfig        = { count:      { label: "Calls",          color: BRAND } };
const durConfig: ChartConfig        = { avg:        { label: "Avg Duration",   color: BRAND } };
  const missedConfig: ChartConfig     = { converted: { label: "Converted", color: GREEN }, missed: { label: "Missed", color: RED } };
  const agentConfig: ChartConfig      = {
    score:      { label: "Score",        color: BRAND },
    revenue:    { label: "Revenue",      color: GREEN },
    calls:      { label: "Calls",        color: AMBER },
    conversion: { label: "Conversion %", color: RED   },
  };

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center bg-card rounded-xl card-elevated">
        <p className="text-sm font-semibold text-muted-foreground">No analytics data</p>
        <p className="text-xs font-mono text-muted-foreground/50">Processed calls will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Controls — date range only (no period selector, always daily) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`h-8 px-3 text-xs rounded-lg border cursor-pointer transition-all ${
                dateRange === r.value
                  ? "bg-primary/8 border-primary/30 text-primary font-medium"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {rangeInfo && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground/50 tabular-nums">
            <span className="font-semibold text-muted-foreground/70">{rangeInfo.label}</span>
            <span className="text-muted-foreground/30">·</span>
            <span>{rangeInfo.days} day{rangeInfo.days !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground/30">·</span>
            <span>{rangedCalls.length.toLocaleString()} calls</span>
          </div>
        )}
      </div>

      {/* ── KPI Summary Row ────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Total Calls",
            value: kpis.totalCalls.toLocaleString(),
            sub: rangeInfo ? `${rangeInfo.label} · ${rangeInfo.days}d` : null,
            color: BRAND,
          },
          {
            label: "Total Revenue",
            value: `$${kpis.totalRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            sub: doneCalls.length > 0 ? `$${(kpis.totalRevenue / doneCalls.length).toFixed(2)}/call` : null,
            color: GREEN,
          },
          {
            label: "Conversion Rate",
            value: kpis.conversion != null ? `${kpis.conversion}%` : "—",
            sub: kpis.opps > 0 ? `${kpis.opps} opportunities` : null,
            color: AMBER,
          },
          {
            label: "Avg Duration",
            value: kpis.avgDur > 0 ? formatDur(kpis.avgDur) : "—",
            sub: rangeInfo ? rangeInfo.label : null,
            color: SLATE,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl card-elevated px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50 mb-2">{kpi.label}</p>
            <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: kpi.color }}>{kpi.value}</p>
            {kpi.sub && <p className="text-[10px] font-mono text-muted-foreground/40 mt-1.5">{kpi.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── 1. Volume & Timing ─────────────────────────────── */}
      <section>
        <SectionTitle>Volume & Timing</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Calls by Day — chronological, affected by date range */}
          <ChartCard title="Calls by Day" subtitle={rangeInfo ? `${rangeInfo.label} · ${rangeInfo.days} day${rangeInfo.days !== 1 ? "s" : ""}` : undefined}>
            <ChartContainer config={volumeConfig} className="h-[180px] w-full aspect-auto">
              <BarChart data={volumeByDay} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill={BRAND} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          {/* Peak Hours — PATTERN, always all data */}
          <ChartCard title="Peak Hours (Pacific)" subtitle={allDataInfo ? `Pattern · ${allDataInfo.label} · ${allDataInfo.days} days total` : "Pattern · all available data"}>
            <ChartContainer config={volumeConfig} className="h-[180px] w-full aspect-auto">
              <BarChart data={peakHours} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="hour" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
                <YAxis hide allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" fill={BRAND} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          {/* Day of Week — PATTERN, always all data */}
          <ChartCard title="Day of Week" subtitle={allDataInfo ? `Pattern · ${allDataInfo.label} · ${allDataInfo.days} days total` : "Pattern · all available data"}>
            <ChartContainer config={volumeConfig} className="h-[180px] w-full aspect-auto">
              <BarChart data={dayOfWeek} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="calls" radius={[3, 3, 0, 0]}>
                  {dayOfWeek.map((entry) => (
                    <Cell key={entry.day} fill={entry.day === "Sat" || entry.day === "Sun" ? SLATE : BRAND} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartCard>

        </div>
      </section>

      {/* ── 2. Category & Order Type ───────────────────────── */}
      <section>
        <SectionTitle>Category & Order Type</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          <ChartCard title="Category Breakdown" subtitle={rangeInfo?.label}>
            <ChartContainer config={catConfig} className="h-[240px] w-full aspect-auto">
              <BarChart data={categoryBreakdown} layout="vertical" margin={{ top: 0, right: 36, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill={BRAND} radius={[0, 3, 3, 0]} barSize={14}>
                  <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: "oklch(0.55 0.04 258)" }} />
                </Bar>
              </BarChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Delivery vs Pickup" subtitle={rangeInfo ? `${rangeInfo.label} · Delivery includes express` : "Delivery includes express"}>
            {(() => {
              const [pickup, delivery] = orderTypeData;
              const total = pickup.count + delivery.count;
              const pickupPct  = total > 0 ? Math.round((pickup.count  / total) * 100) : 50;
              const deliveryPct = 100 - pickupPct;
              const pickupPerCall  = pickup.count  > 0 ? pickup.revenue  / pickup.count  : 0;
              const deliveryPerCall = delivery.count > 0 ? delivery.revenue / delivery.count : 0;
              return (
                <div className="space-y-6 pt-1">
                  {/* Proportional bar */}
                  <div>
                    <div className="flex h-3 rounded-full overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pickupPct}%`, background: BRAND }} />
                      <div className="h-full transition-all" style={{ width: `${deliveryPct}%`, background: GREEN }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] font-mono text-muted-foreground/40">{pickupPct}% pickup</span>
                      <span className="text-[9px] font-mono text-muted-foreground/40">{deliveryPct}% delivery</span>
                    </div>
                  </div>
                  {/* Stat columns */}
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: BRAND }} />
                        <span className="text-[11px] font-semibold">Pickup</span>
                      </div>
                      <div className="space-y-1.5">
                        <StatLine label="Calls"   value={pickup.count.toLocaleString()} />
                        <StatLine label="Revenue" value={`$${pickup.revenue.toFixed(2)}`} />
                        <StatLine label="$/call"  value={`$${pickupPerCall.toFixed(2)}`} accent />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: GREEN }} />
                        <span className="text-[11px] font-semibold">Delivery</span>
                      </div>
                      <div className="space-y-1.5">
                        <StatLine label="Calls"   value={delivery.count.toLocaleString()} />
                        <StatLine label="Revenue" value={`$${delivery.revenue.toFixed(2)}`} />
                        <StatLine label="$/call"  value={`$${deliveryPerCall.toFixed(2)}`} accent />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </ChartCard>

        </div>
      </section>

      {/* ── 3. Sales Performance ────────────────────────────── */}
      <section>
        <SectionTitle>Sales Performance</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          <ChartCard title="Revenue by Day" subtitle={rangeInfo?.label}>
            <ChartContainer config={revenueConfig} className="h-[200px] w-full aspect-auto">
              <LineChart data={revenueOverTime} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `$${Number(value).toFixed(2)}`} />} />
                <Line type="monotone" dataKey="revenue" stroke={GREEN} strokeWidth={2} dot={{ fill: GREEN, r: 3 }} />
              </LineChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Conversion Rate by Day" subtitle={rangeInfo?.label}>
            <ChartContainer config={conversionConfig} className="h-[200px] w-full aspect-auto">
              <LineChart data={conversionOverTime} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => `${value}%`} />} />
                <Line type="monotone" dataKey="rate" stroke={BRAND} strokeWidth={2} dot={{ fill: BRAND, r: 3 }} />
              </LineChart>
            </ChartContainer>
          </ChartCard>

        </div>
      </section>

      {/* ── 4. Duration Analytics ──────────────────────────── */}
      <section>
        <SectionTitle>Duration Analytics</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          <ChartCard title="Avg Duration by Agent" subtitle={rangeInfo?.label}>
            <ChartContainer config={durConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={durationByAgent} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatDur(Number(value))} />} />
                <Bar dataKey="avg" fill={BRAND} radius={[0, 3, 3, 0]} barSize={14} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

          <ChartCard title="Avg Duration by Category" subtitle={rangeInfo ? `${rangeInfo.label} · Min 5 calls` : "Min 5 calls"}>
            <ChartContainer config={durConfig} className="h-[220px] w-full aspect-auto">
              <BarChart data={durationByCategory} layout="vertical" margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) =>
                        `${formatDur(Number(value))} · ${(item.payload as { count?: number }).count ?? ""} calls`
                      }
                    />
                  }
                />
                <Bar dataKey="avg" fill={AMBER} radius={[0, 3, 3, 0]} barSize={14} />
              </BarChart>
            </ChartContainer>
          </ChartCard>

        </div>
      </section>

      {/* ── 5. Missed Opportunities ─────────────────────────── */}
      <section>
        <SectionTitle>Missed Sales Opportunities</SectionTitle>
        <ChartCard
          title="Opportunities by Agent"
          subtitle={rangeInfo ? `${rangeInfo.label} · green = converted, red = missed` : "green = converted, red = missed"}
        >
          {missedByAgent.length === 0 ? (
            <p className="text-xs font-mono text-muted-foreground/40 py-8 text-center">No opportunity data in this range</p>
          ) : (
            <ChartContainer config={missedConfig} className="w-full aspect-auto" style={{ height: `${Math.max(140, missedByAgent.length * 36 + 20)}px` }}>
              <BarChart data={missedByAgent} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => name === "converted" ? `${value} converted` : `${value} missed`}
                    />
                  }
                />
                <Bar dataKey="converted" stackId="a" fill={GREEN} radius={[0, 0, 0, 0]} barSize={16} />
                <Bar dataKey="missed"    stackId="a" fill={RED}   radius={[0, 3, 3, 0]} barSize={16}>
                  <LabelList
                    content={(props) => {
                      const { x, y, width, height, index } = props as { x: number; y: number; width: number; height: number; index: number };
                      const d = missedByAgent[index];
                      if (!d) return null;
                      return (
                        <text x={Number(x) + Number(width) + 6} y={Number(y) + Number(height) / 2 + 4} fontSize={10} fill="oklch(0.55 0.04 258)" fontFamily="monospace">
                          {d.rate}%
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </ChartCard>
      </section>

      {/* ── 6. Agent Comparison ─────────────────────────────── */}
      <section>
        <SectionTitle>Agent Comparison</SectionTitle>
        <div className="bg-card rounded-xl card-elevated p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-muted/60 w-fit">
              {(["revenue", "calls", "score", "conversion"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setAgentMetric(m)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    agentMetric === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground/60 hover:text-muted-foreground"
                  }`}
                >
                  {m === "score" ? "Score" : m === "revenue" ? "Revenue" : m === "calls" ? "Calls" : "Conversion"}
                </button>
              ))}
            </div>
            {rangeInfo && (
              <span className="text-[10px] font-mono text-muted-foreground/40 tabular-nums">{rangeInfo.label}</span>
            )}
          </div>
          <ChartContainer config={agentConfig} className="h-[260px] w-full aspect-auto">
            <BarChart data={agentComparison} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) =>
                      name === "revenue"     ? `$${Number(value).toFixed(2)}`
                      : name === "conversion" ? `${value}%`
                      : String(value)
                    }
                  />
                }
              />
              <Bar dataKey={agentMetric} fill={`var(--color-${agentMetric})`} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </section>

    </div>
  );
}
