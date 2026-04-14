import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getSupabaseServer } from "@/lib/supabase";
import { type ReportSnapshot, type ReportRecommendation } from "@/lib/report-types";

type PriorReportRow = { snapshot: ReportSnapshot; title: string; period_start: string; period_end: string };

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildNarrativePrompt(snapshot: ReportSnapshot, title: string): string {
  const { period, kpis, agents, categories, dailyBreakdown, missedOpportunities } = snapshot;

  const stars           = agents.filter((a) => a.status === "star");
  const underperformers = agents.filter((a) => a.status === "underperformer");
  const watches         = agents.filter((a) => a.status === "watch");

  // Standout: highest revenue-per-call among agents with 10+ calls
  const standout = [...agents]
    .filter((a) => a.calls >= 10)
    .sort((a, b) => b.revenuePerCall - a.revenuePerCall)[0];

  // Worst converters (meaningful sample): 10+ opportunities
  const worstConverters = [...missedOpportunities]
    .filter((m) => m.opportunities >= 10)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  // Operational signals
  const peakDay     = [...dailyBreakdown].sort((a, b) => b.calls - a.calls)[0];
  const lightestDay = [...dailyBreakdown].sort((a, b) => a.calls - b.calls)[0];
  const followUpPct = kpis.processedCalls > 0
    ? (kpis.outcomes.follow_up / kpis.processedCalls * 100).toFixed(1)
    : "0";
  // Categories with volume but zero revenue — deflection candidates
  const deflectable = categories.filter((c) => c.revenue === 0 && c.count >= 5);
  // Revenue concentration: what % does the top 2 agents generate
  const topTwoRevenue = agents.slice(0, 2).reduce((s, a) => s + a.revenue, 0);
  const topTwoPct = kpis.totalRevenue > 0
    ? (topTwoRevenue / kpis.totalRevenue * 100).toFixed(0)
    : "0";

  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return `You are a senior operations analyst. A call center manager will read this report. They already see all the raw numbers — do NOT repeat them verbatim. Your job is to interpret, contrast, and surface what matters.

REPORT: ${title}
PERIOD: ${fmtDate(period.start)} – ${fmtDate(period.end)} (${period.days} days, ${kpis.totalCalls} calls, $${kpis.totalRevenue.toFixed(0)} revenue, ${kpis.conversionRate}% conversion)

AGENT PERFORMANCE (all agents, by call volume):
${agents
  .map(
    (a) =>
      `- ${a.name}: ${a.calls} calls | ${Math.round(a.conversionRate * 100)}% conv | $${a.revenuePerCall.toFixed(2)}/call | score ${a.avgScore.toFixed(1)} | status: ${a.status}`
  )
  .join("\n")}

STANDOUT THIS WEEK: ${standout ? `${standout.name} — $${standout.revenuePerCall.toFixed(2)}/call, ${Math.round(standout.conversionRate * 100)}% conversion` : "none"}
STARS (${stars.length}): ${stars.map((a) => a.name).join(", ") || "none"}
WATCH LIST (${watches.length}): ${watches.map((a) => a.name).join(", ") || "none"}
UNDERPERFORMERS (${underperformers.length}): ${underperformers.map((a) => a.name).join(", ") || "none"}

WORST CONVERTERS (10+ opportunities):
${worstConverters.map((m) => `- ${m.name}: ${m.rate}% converted (${m.opportunities} opps, ${m.missed} missed)`).join("\n") || "none"}

CALL CATEGORIES (volume + revenue):
${categories.map((c) => `- ${c.name}: ${c.count} calls (${c.pct}%), $${c.revenue.toFixed(0)} revenue`).join("\n")}

OPERATIONAL SIGNALS:
- Peak day: ${peakDay?.label ?? "n/a"} with ${peakDay?.calls ?? 0} calls
- Lightest day: ${lightestDay?.label ?? "n/a"} with ${lightestDay?.calls ?? 0} calls (${peakDay && lightestDay ? Math.round(peakDay.calls / Math.max(lightestDay.calls, 1)) : 1}× swing)
- Follow-up rate: ${followUpPct}% of processed calls (${kpis.outcomes.follow_up} calls needed follow-up)
- Escalation rate: ${kpis.outcomes.escalated} escalated (${kpis.processedCalls > 0 ? (kpis.outcomes.escalated / kpis.processedCalls * 100).toFixed(1) : "0"}%)
- Revenue concentration: top 2 agents (${agents[0]?.name}, ${agents[1]?.name}) generated ${topTwoPct}% of total revenue
- Zero-revenue call categories (deflection candidates): ${deflectable.map((c) => `${c.name} (${c.count} calls)`).join(", ") || "none"}
- Sentiment: ${kpis.sentiment.negative} negative calls out of ${kpis.processedCalls}

=== RULES FOR THE NARRATIVE ===
- Write exactly 2 short paragraphs, max 120 words total.
- Do NOT restate metrics verbatim (no "the conversion rate was X%", no "total revenue was $Y").
- Interpret what the numbers mean: what is working, what is broken, what is surprising.
- Name the standout performer and explain specifically why they stand out vs peers.
- Name the most concerning agent(s) by name and describe the pattern.
- Use plain, direct prose — no bullets, no corporate filler.

=== OUTPUT FORMAT ===

Return valid JSON:
{
  "narrative": "Two tight paragraphs. Insight-driven, not stat-driven. Max 120 words.",
  "recommendations": [
    {
      "rank": 1,
      "title": "Specific imperative action (max 8 words)",
      "detail": "Exactly 2 sentences. Sentence 1: the specific data signal (name the agent, category, or pattern — cite the number). Sentence 2: the concrete action to take this week.",
      "impact": "high",
      "category": "people"
    }
  ]
}

Write exactly 6 recommendations:
- 3 with category "people": agent-specific coaching or performance actions. Must name a specific agent and cite a specific number.
- 3 with category "operations": systemic or structural improvements (staffing, call deflection, process, revenue concentration, follow-up tracking, etc.). Must reference a specific data pattern from the operational signals.
Rank all 6 together by estimated business impact. impact must be "high", "medium", or "low". No generic advice — every item must be grounded in this week's data.`;
}

// ── Comparison Prompt ─────────────────────────────────────────────────────────

function buildComparisonPrompt(current: ReportSnapshot, prior: PriorReportRow): string {
  const fmtDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

  const pct = (n: number, d: number) =>
    d === 0 ? "n/a" : `${n > d ? "+" : ""}${((n - d) / d * 100).toFixed(1)}%`;
  const delta = (n: number, d: number, unit = "") =>
    `${n > d ? "+" : ""}${(n - d).toFixed(unit === "$" ? 2 : 1)}${unit}`;
  const pp = (n: number, d: number) =>
    `${n > d ? "+" : ""}${(n - d).toFixed(1)}pp`;

  const p = prior.snapshot;
  const c = current;

  // Agent status changes
  const priorMap = new Map(p.agents.map((a) => [a.name, a]));
  const currentNames = new Set(c.agents.map((a) => a.name));

  const statusChanges = c.agents
    .filter((a) => priorMap.has(a.name) && priorMap.get(a.name)!.status !== a.status)
    .map((a) => `${a.name}: ${priorMap.get(a.name)!.status} → ${a.status}`);
  const newAgents     = c.agents.filter((a) => !priorMap.has(a.name)).map((a) => a.name);
  const departedAgents = p.agents.filter((a) => !currentNames.has(a.name)).map((a) => a.name);

  // Conversion leaders (10+ opps)
  const topConvertersByRate = (agents: typeof c.agents) =>
    [...agents]
      .filter((a) => a.opportunities >= 10)
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 3)
      .map((a) => `${a.name} (${Math.round(a.conversionRate * 100)}%)`);

  // Biggest movers (conversion rate change, agents present in both)
  const movers = c.agents
    .filter((a) => priorMap.has(a.name) && a.opportunities >= 5)
    .map((a) => ({
      name: a.name,
      change: a.conversionRate - priorMap.get(a.name)!.conversionRate,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 3)
    .map((m) => `${m.name}: ${m.change >= 0 ? "+" : ""}${(m.change * 100).toFixed(0)}pp`);

  return `You are a senior operations analyst writing a week-over-week comparison for a call center manager.

COMPARING:
  Prior:   "${prior.title}" — ${fmtDate(prior.period_start)} to ${fmtDate(prior.period_end)} (${p.period.days} days)
  Current: this period — ${fmtDate(c.period.start)} to ${fmtDate(c.period.end)} (${c.period.days} days)

KPI CHANGES (prior → current):
  Total calls:     ${p.kpis.totalCalls} → ${c.kpis.totalCalls} (${delta(c.kpis.totalCalls, p.kpis.totalCalls)} | ${pct(c.kpis.totalCalls, p.kpis.totalCalls)})
  Total revenue:   $${p.kpis.totalRevenue.toFixed(0)} → $${c.kpis.totalRevenue.toFixed(0)} (${pct(c.kpis.totalRevenue, p.kpis.totalRevenue)})
  Revenue/call:    $${p.kpis.avgRevenuePerCall.toFixed(2)} → $${c.kpis.avgRevenuePerCall.toFixed(2)}
  Conversion rate: ${p.kpis.conversionRate}% → ${c.kpis.conversionRate}% (${pp(c.kpis.conversionRate, p.kpis.conversionRate)})
  Avg duration:    ${fmtDur(p.kpis.avgDuration)} → ${fmtDur(c.kpis.avgDuration)}
  Active agents:   ${p.kpis.activeAgents} → ${c.kpis.activeAgents}
  Positive sentiment: ${p.kpis.sentiment.positive} → ${c.kpis.sentiment.positive}
  Negative sentiment: ${p.kpis.sentiment.negative} → ${c.kpis.sentiment.negative}

AGENT CHANGES:
  Status changes:   ${statusChanges.join(", ") || "none"}
  New agents:       ${newAgents.join(", ") || "none"}
  Departed agents:  ${departedAgents.join(", ") || "none"}
  Biggest conversion movers: ${movers.join(", ") || "none"}

TOP CONVERTERS (10+ opps):
  Prior:   ${topConvertersByRate(p.agents).join(", ") || "n/a"}
  Current: ${topConvertersByRate(c.agents).join(", ") || "n/a"}

TOP REVENUE AGENTS:
  Prior:   ${[...p.agents].sort((a, b) => b.revenue - a.revenue).slice(0, 3).map((a) => `${a.name} ($${a.revenue.toFixed(0)})`).join(", ")}
  Current: ${[...c.agents].sort((a, b) => b.revenue - a.revenue).slice(0, 3).map((a) => `${a.name} ($${a.revenue.toFixed(0)})`).join(", ")}

TOP CATEGORIES:
  Prior:   ${p.categories.slice(0, 3).map((c) => `${c.name} (${c.count} calls, $${c.revenue.toFixed(0)})`).join(", ")}
  Current: ${c.categories.slice(0, 3).map((cat) => `${cat.name} (${cat.count} calls, $${cat.revenue.toFixed(0)})`).join(", ")}

=== RULES ===
- Write exactly 2 short paragraphs, max 130 words total.
- Paragraph 1: the headline story — what improved or declined in volume, revenue, and conversion and what drives it.
- Paragraph 2: individual agent storylines — who improved, who regressed, any notable arrivals or departures, and what it means for the team.
- Name specific agents with specific numbers. No generic filler.
- Do NOT repeat every number from the table — focus on what's surprising, meaningful, or directional.

Return valid JSON:
{
  "comparison_narrative": "Two tight paragraphs comparing the two periods."
}`;
}

// ── POST — Generate a new report ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      title: string;
      periodStart: string;
      periodEnd: string;
      snapshot: ReportSnapshot;
      priorReportId?: string;
    };

    const { title, periodStart, periodEnd, snapshot, priorReportId } = body;

    if (!title || !periodStart || !periodEnd || !snapshot) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = getSupabaseServer();
    const openai   = getOpenAI();

    // Fetch prior report snapshot (if requested) before parallel AI calls
    let priorRow: PriorReportRow | null = null;
    if (priorReportId) {
      const { data } = await supabase
        .from("reports")
        .select("snapshot, title, period_start, period_end")
        .eq("id", priorReportId)
        .single();
      if (data) priorRow = data as PriorReportRow;
    }

    // Run narrative + comparison in parallel — same total wall-clock time as narrative alone
    const [narrativeRes, comparisonRes] = await Promise.all([
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a professional operations analyst. Always respond with valid JSON only." },
          { role: "user", content: buildNarrativePrompt(snapshot, title) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
      priorRow
        ? openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "You are a professional operations analyst. Always respond with valid JSON only." },
              { role: "user", content: buildComparisonPrompt(snapshot, priorRow) },
            ],
            response_format: { type: "json_object" },
            temperature: 0.4,
          })
        : Promise.resolve(null),
    ]);

    // Parse narrative
    let parsed: { narrative?: string; recommendations?: ReportRecommendation[] };
    try {
      parsed = JSON.parse(narrativeRes.choices[0].message.content ?? "{}");
    } catch {
      parsed = {};
    }
    const narrative       = parsed.narrative       ?? "Narrative generation failed.";
    const recommendations = parsed.recommendations ?? [];

    // Parse comparison (gracefully — failure doesn't block report creation)
    let comparisonNarrative: string | null = null;
    if (comparisonRes) {
      try {
        const compParsed = JSON.parse(comparisonRes.choices[0].message.content ?? "{}");
        comparisonNarrative = compParsed.comparison_narrative ?? null;
      } catch {
        comparisonNarrative = null;
      }
    }

    // Save to Supabase
    const { data, error } = await supabase
      .from("reports")
      .insert({
        title,
        period_start:         periodStart,
        period_end:           periodEnd,
        snapshot,
        narrative,
        recommendations,
        prior_report_id:      priorReportId ?? null,
        comparison_narrative: comparisonNarrative,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (err) {
    console.error("Report generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ── GET — List all reports ────────────────────────────────────────────────────

export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("reports")
      .select("id, title, period_start, period_end, generated_at, prior_report_id")
      .order("generated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ reports: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
