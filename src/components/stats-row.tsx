"use client";

import { useMemo } from "react";
import { NumberTicker } from "@/components/ui/number-ticker";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { type CallRecord } from "@/lib/supabase";

type Props = { calls: CallRecord[] };

const POS_COLOR = "oklch(0.59 0.17 148)";
const NEU_COLOR = "oklch(0.55 0.04 258)";
const NEG_COLOR = "oklch(0.56 0.21 20)";

const chartConfig = {
  calls: {
    label: "Calls",
    color: "oklch(0.56 0.23 275)",
  },
} satisfies ChartConfig;

export function StatsRow({ calls }: Props) {
  const total = calls.length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = calls.filter((c) => c.start_time?.startsWith(todayStr)).length;

  const sentimentCounts = useMemo(() => {
    const counts = { positive: 0, neutral: 0, negative: 0 };
    for (const c of calls) {
      const s = c.sentiment as keyof typeof counts;
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [calls]);

  const analyzed = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;
  const positivePct = analyzed > 0 ? Math.round((sentimentCounts.positive / analyzed) * 100) : 0;
  const neutralPct  = analyzed > 0 ? Math.round((sentimentCounts.neutral  / analyzed) * 100) : 0;
  const negativePct = analyzed > 0 ? Math.round((sentimentCounts.negative / analyzed) * 100) : 0;

  // 7-day daily volume
  const volumeData = useMemo(() => {
    const days: { date: string; label: string; calls: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const dateStr = d.toISOString().slice(0, 10);
      const label = i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" });
      const count = calls.filter((c) => c.start_time?.startsWith(dateStr)).length;
      days.push({ date: dateStr, label, calls: count });
    }
    return days;
  }, [calls]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">

      {/* Total Calls */}
      <div className="bg-card rounded-xl card-elevated p-5 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
          Total Calls
        </p>
        <div>
          <div className="text-[42px] font-bold leading-none tracking-tight text-foreground tabular-nums">
            {total > 0
              ? <NumberTicker value={total} className="text-[42px] font-bold leading-none tracking-tight" />
              : "0"}
          </div>
          <p className="text-[11px] text-muted-foreground/50 mt-2 font-mono">all time</p>
        </div>
      </div>

      {/* Today */}
      <div className="bg-card rounded-xl card-elevated p-5 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
          Today
        </p>
        <div>
          <div
            className="text-[42px] font-bold leading-none tracking-tight tabular-nums"
            style={{ color: todayCount > 0 ? "oklch(0.56 0.23 275)" : "oklch(0.145 0.012 258 / 0.4)" }}
          >
            {todayCount > 0
              ? <NumberTicker value={todayCount} className="text-[42px] font-bold leading-none tracking-tight" style={{ color: "oklch(0.56 0.23 275)" }} />
              : "0"}
          </div>
          <p className="text-[11px] text-muted-foreground/50 mt-2 font-mono">calls so far</p>
        </div>
      </div>

      {/* Sentiment */}
      <div className="bg-card rounded-xl card-elevated p-5 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
          Sentiment
        </p>
        {analyzed > 0 ? (
          <div className="flex flex-col gap-2.5">
            {/* Stacked bar */}
            <div className="flex h-2 w-full rounded-full overflow-hidden gap-px">
              <div className="rounded-l-full transition-all duration-700" style={{ width: `${positivePct}%`, background: POS_COLOR }} />
              <div className="transition-all duration-700" style={{ width: `${neutralPct}%`,  background: NEU_COLOR }} />
              <div className="rounded-r-full transition-all duration-700" style={{ width: `${negativePct}%`, background: NEG_COLOR }} />
            </div>
            {/* Legend rows */}
            <div className="flex flex-col gap-1.5">
              {[
                { label: "Positive", count: sentimentCounts.positive, pct: positivePct, color: POS_COLOR },
                { label: "Neutral",  count: sentimentCounts.neutral,  pct: neutralPct,  color: NEU_COLOR },
                { label: "Negative", count: sentimentCounts.negative, pct: negativePct, color: NEG_COLOR },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[11px] text-muted-foreground/60 flex-1">{s.label}</span>
                  <span className="text-[11px] font-mono tabular-nums text-foreground/70">{s.count}</span>
                  <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40 w-7 text-right">{s.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 min-h-[68px]">
            <p className="text-sm text-muted-foreground/30 font-mono">no data</p>
          </div>
        )}
      </div>

      {/* 7-Day Volume */}
      <div className="bg-card rounded-xl card-elevated p-5 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
          7-Day Volume
        </p>
        <ChartContainer config={chartConfig} className="h-[80px] w-full aspect-auto">
          <AreaChart data={volumeData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="oklch(0.56 0.23 275)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="oklch(0.56 0.23 275)" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "oklch(0.55 0.04 258 / 0.5)", fontFamily: "var(--font-mono)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis hide allowDecimals={false} />
            <ChartTooltip
              content={<ChartTooltipContent hideLabel={false} indicator="dot" />}
              cursor={{ stroke: "oklch(0.56 0.23 275 / 0.2)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="calls"
              stroke="oklch(0.56 0.23 275)"
              strokeWidth={1.5}
              fill="url(#volumeGradient)"
              dot={false}
              activeDot={{ r: 3, fill: "oklch(0.56 0.23 275)", strokeWidth: 0 }}
            />
          </AreaChart>
        </ChartContainer>
      </div>

    </div>
  );
}
