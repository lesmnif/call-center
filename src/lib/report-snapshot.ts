import { type CallRecord } from "./supabase";
import {
  type ReportSnapshot,
  type AgentReport,
  type CategoryReport,
  type DayReport,
  type MissedOpportunity,
} from "./report-types";
import { TZ, dateToPacificStr } from "./timezone";

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function agentStatus(a: { avgScore: number; conversionRate: number; calls: number }): AgentReport["status"] {
  // Underperformer: objectively bad score, or enough volume to confirm a bad conversion pattern
  if (a.avgScore < 3.0) return "underperformer";
  if (a.calls >= 10 && a.conversionRate < 0.25) return "underperformer";
  // Watch: concerning conversion with some volume, or weak score
  if (a.avgScore < 3.5) return "watch";
  if (a.calls >= 5 && a.conversionRate < 0.30) return "watch";
  // Star: genuinely exceptional — not just "above average" on a 50% team
  if (a.avgScore >= 4.3 && a.conversionRate >= 0.60) return "star";
  return "solid";
}

export function buildReportSnapshot(
  calls: CallRecord[],
  periodStart: string,
  periodEnd: string
): ReportSnapshot {
  const done = calls.filter((c) => c.status === "done");

  // ── KPIs ────────────────────────────────────────────────────────────────
  const totalRevenue = done.reduce((s, c) => s + (c.revenue ?? 0), 0);
  const opportunities = done.filter((c) => c.had_sales_opportunity).length;
  const salesClosed   = done.filter((c) => c.sale_completed).length;
  const withDur       = calls.filter((c) => c.duration_seconds != null);
  const avgDuration   = withDur.length
    ? Math.round(withDur.reduce((s, c) => s + c.duration_seconds!, 0) / withDur.length)
    : 0;

  const sentiment = {
    positive: done.filter((c) => c.sentiment === "positive").length,
    neutral:  done.filter((c) => c.sentiment === "neutral").length,
    negative: done.filter((c) => c.sentiment === "negative").length,
  };

  const outcomes = {
    resolved:  done.filter((c) => c.outcome === "resolved").length,
    follow_up: done.filter((c) => c.outcome === "follow_up_needed").length,
    escalated: done.filter((c) => c.outcome === "escalated").length,
  };

  // ── Agents ───────────────────────────────────────────────────────────────
  const byAgent = new Map<string, CallRecord[]>();
  for (const c of done) {
    if (
      !c.agent_name ||
      c.efficiency_score == null ||
      c.communication_score == null ||
      c.resolution_score == null
    ) continue;
    const list = byAgent.get(c.agent_name) ?? [];
    list.push(c);
    byAgent.set(c.agent_name, list);
  }

  const agents: AgentReport[] = [];
  for (const [name, ac] of byAgent) {
    const avgEff  = avg(ac.map((c) => c.efficiency_score!));
    const avgComm = avg(ac.map((c) => c.communication_score!));
    const avgRes  = avg(ac.map((c) => c.resolution_score!));
    const composite = (avgEff + avgComm + avgRes) / 3;

    const revenue    = ac.reduce((s, c) => s + (c.revenue ?? 0), 0);
    const opps       = ac.filter((c) => c.had_sales_opportunity).length;
    const sales      = ac.filter((c) => c.sale_completed).length;
    const missed     = ac.filter((c) => c.upsell_opportunities && !c.upsell_attempted).length;

    const durs       = ac.filter((c) => c.duration_seconds != null);
    const totalDur   = durs.reduce((s, c) => s + c.duration_seconds!, 0);
    const hours      = totalDur / 3600;
    const activeDays = new Set(ac.map((c) => c.start_time?.slice(0, 10)).filter(Boolean)).size;

    const agent: AgentReport = {
      name,
      calls:             ac.length,
      revenue:           +revenue.toFixed(2),
      conversionRate:    opps > 0 ? +(sales / opps).toFixed(3) : 0,
      avgScore:          +composite.toFixed(2),
      avgEfficiency:     +avgEff.toFixed(2),
      avgCommunication:  +avgComm.toFixed(2),
      avgResolution:     +avgRes.toFixed(2),
      salesClosed:       sales,
      opportunities:     opps,
      missedUpsells:     missed,
      avgDuration:       durs.length ? Math.round(totalDur / durs.length) : 0,
      revenuePerHour:    hours > 0 ? +(revenue / hours).toFixed(2) : 0,
      revenuePerCall:    ac.length > 0 ? +(revenue / ac.length).toFixed(2) : 0,
      salesPerDay:       activeDays > 0 ? +(sales / activeDays).toFixed(2) : 0,
      activeDays,
      status:            "solid",
    };
    agent.status = agentStatus(agent);
    agents.push(agent);
  }
  agents.sort((a, b) => b.calls - a.calls);

  // ── Categories ───────────────────────────────────────────────────────────
  const catMap = new Map<string, { count: number; revenue: number }>();
  for (const c of done) {
    if (!c.category) continue;
    const e = catMap.get(c.category) ?? { count: 0, revenue: 0 };
    e.count++;
    e.revenue += c.revenue ?? 0;
    catMap.set(c.category, e);
  }
  const categories: CategoryReport[] = Array.from(catMap.entries())
    .map(([name, d]) => ({
      name:    name.replace(/_/g, " "),
      count:   d.count,
      revenue: +d.revenue.toFixed(2),
      pct:     done.length ? +(d.count / done.length * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    // Drop zero-revenue tail noise — keep only categories with revenue or meaningful volume
    .filter((c) => c.revenue > 0 || c.count >= 5);

  // ── Daily breakdown ───────────────────────────────────────────────────────
  const dayMap = new Map<string, { all: CallRecord[]; done: CallRecord[] }>();
  for (const c of calls) {
    if (!c.start_time) continue;
    const day = dateToPacificStr(new Date(c.start_time));
    const e   = dayMap.get(day) ?? { all: [], done: [] };
    e.all.push(c);
    if (c.status === "done") e.done.push(c);
    dayMap.set(day, e);
  }

  const dailyBreakdown: DayReport[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const dt = new Date(date + "T12:00:00");
      return {
        date,
        label:          `${dt.toLocaleDateString("en-US", { weekday: "short", timeZone: TZ })} ${dt.getDate()}`,
        calls:          d.all.length,
        processedCalls: d.done.length,
        revenue:        +d.done.reduce((s, c) => s + (c.revenue ?? 0), 0).toFixed(2),
        sales:          d.done.filter((c) => c.sale_completed).length,
      };
    });

  // ── Missed opportunities ──────────────────────────────────────────────────
  const missedMap = new Map<string, { opps: number; converted: number }>();
  for (const c of done) {
    if (!c.agent_name || !c.had_sales_opportunity) continue;
    const e = missedMap.get(c.agent_name) ?? { opps: 0, converted: 0 };
    e.opps++;
    if (c.sale_completed) e.converted++;
    missedMap.set(c.agent_name, e);
  }

  const missedOpportunities: MissedOpportunity[] = Array.from(missedMap.entries())
    .map(([name, d]) => ({
      name,
      opportunities: d.opps,
      converted:     d.converted,
      missed:        d.opps - d.converted,
      rate:          d.opps > 0 ? Math.round(d.converted / d.opps * 100) : 0,
    }))
    // Sort by conversion rate ascending: worst converters first.
    // Manager can judge sample size from the Opportunities column.
    .sort((a, b) => a.rate - b.rate);

  // ── Period metadata ───────────────────────────────────────────────────────
  const days =
    Math.round(
      (new Date(periodEnd + "T00:00:00").getTime() -
        new Date(periodStart + "T00:00:00").getTime()) /
        86_400_000
    ) + 1;

  return {
    period: { start: periodStart, end: periodEnd, days },
    kpis: {
      totalCalls:       calls.length,
      processedCalls:   done.length,
      totalRevenue:     +totalRevenue.toFixed(2),
      avgRevenuePerCall: done.length > 0 ? +(totalRevenue / done.length).toFixed(2) : 0,
      conversionRate:   opportunities > 0 ? +(salesClosed / opportunities * 100).toFixed(1) : 0,
      opportunities,
      salesClosed,
      avgDuration,
      sentiment,
      outcomes,
      activeAgents:     byAgent.size,
    },
    agents,
    categories,
    dailyBreakdown,
    missedOpportunities,
  };
}
