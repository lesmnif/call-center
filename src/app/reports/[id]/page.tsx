import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase";
import { type ReportRecord } from "@/lib/report-types";
import { PrintButton } from "./print-button";

// ── Data fetching ─────────────────────────────────────────────────────────────

async function getReport(id: string): Promise<ReportRecord | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as ReportRecord;
}

type PriorReportRow = {
  title: string;
  period_start: string;
  period_end: string;
  snapshot: import("@/lib/report-types").ReportSnapshot;
};

async function getPriorReport(id: string): Promise<PriorReportRow | null> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("reports")
    .select("title, period_start, period_end, snapshot")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as PriorReportRow;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmtShort(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

function fmtMoney(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  star:           { label: "★ Star",          color: "#1d7a3a", bg: "#f0fdf4", border: "#86efac" },
  solid:          { label: "Solid",            color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
  watch:          { label: "Watch",            color: "#92400e", bg: "#fffbeb", border: "#fcd34d" },
  underperformer: { label: "Underperformer",   color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
};

const IMPACT_DOT: Record<string, string> = {
  high:   "#dc2626",
  medium: "#d97706",
  low:    "#6b7280",
};

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "2.5rem", pageBreakInside: "avoid" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1.25rem", paddingBottom: "0.5rem", borderBottom: "2px solid #111" }}>
        <span style={{ fontFamily: "monospace", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", color: "#6b7280" }}>§ {num}</span>
        <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase" }}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch report + prior report in parallel
  const report = await getReport(id);
  if (!report) notFound();

  const priorReport = report.prior_report_id
    ? await getPriorReport(report.prior_report_id)
    : null;

  const { snapshot, narrative, recommendations, comparison_narrative } = report;
  const { kpis, agents, categories, dailyBreakdown, missedOpportunities } = snapshot;

  const stars           = agents.filter((a) => a.status === "star");
  const underperformers = agents.filter((a) => a.status === "underperformer");
  const watches         = agents.filter((a) => a.status === "watch");
  const sentTotal     = kpis.sentiment.positive + kpis.sentiment.neutral + kpis.sentiment.negative;
  const positivePct   = sentTotal > 0 ? Math.round(kpis.sentiment.positive / sentTotal * 100) : 0;
  const negativePct   = sentTotal > 0 ? Math.round(kpis.sentiment.negative / sentTotal * 100) : 0;

  const peakDay = [...dailyBreakdown].sort((a, b) => b.calls - a.calls)[0];
  const totalDailyRevenue = dailyBreakdown.reduce((s, d) => s + d.revenue, 0);
  const maxRevenue = Math.max(...dailyBreakdown.map((d) => d.revenue), 1);
  const maxCalls   = Math.max(...dailyBreakdown.map((d) => d.calls), 1);

  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      maxWidth: "820px",
      margin: "0 auto",
      padding: "2.5rem 2rem",
      color: "#111",
      background: "#fff",
      lineHeight: 1.6,
    }}>

      {/* ── Toolbar (hidden in print) ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }} className="no-print">
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: "0.75rem",
            fontFamily: "system-ui, sans-serif",
            fontWeight: 500,
            color: "#6b7280",
            textDecoration: "none",
            padding: "0.4rem 0.75rem",
            border: "1px solid #e5e7eb",
            borderRadius: "6px",
            background: "#f9fafb",
          }}
        >
          ← Dashboard
        </Link>
        <PrintButton />
      </div>

      {/* ── Masthead ── */}
      <header style={{ borderTop: "4px solid #111", borderBottom: "1px solid #d1d5db", paddingBottom: "1.25rem", marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "1rem" }}>
          <div>
            <p style={{ margin: 0, fontSize: "0.65rem", fontFamily: "monospace", letterSpacing: "0.2em", color: "#6b7280", textTransform: "uppercase" }}>
              Kolas Intelligence · Call Center
            </p>
            <h1 style={{ margin: "0.25rem 0 0", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {report.title}
            </h1>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.85rem", color: "#4b5563" }}>
              Weekly performance report — {fmtShort(snapshot.period.start)} — {fmtShort(snapshot.period.end)}
            </p>
          </div>
          <div style={{ textAlign: "right", fontFamily: "monospace" }}>
            <p style={{ margin: 0, fontSize: "0.65rem", color: "#9ca3af", letterSpacing: "0.1em" }}>GENERATED</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#4b5563" }}>
              {fmtDate(report.generated_at.slice(0, 10))}
            </p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.65rem", color: "#9ca3af", letterSpacing: "0.1em" }}>WINDOW</p>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#4b5563" }}>
              {snapshot.period.days}d · {kpis.totalCalls.toLocaleString()} calls
            </p>
          </div>
        </div>
      </header>

      {/* ── § 01 — At a Glance ── */}
      <Section num="01" title="The Center at a Glance">
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.85rem", color: "#374151" }}>
          Aggregate performance across {kpis.activeAgents} active agent{kpis.activeAgents !== 1 ? "s" : ""} for the {snapshot.period.days}-day period.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1rem" }}>
          {[
            { label: "Total Calls",        value: kpis.totalCalls.toLocaleString(),          sub: `${kpis.processedCalls.toLocaleString()} fully analyzed` },
            { label: "Total Revenue",      value: fmtMoney(kpis.totalRevenue),               sub: `avg ${fmtMoney(kpis.avgRevenuePerCall)}/call` },
            { label: "Conversion Rate",    value: `${kpis.conversionRate}%`,                 sub: `${kpis.salesClosed} sales · ${kpis.opportunities} opps` },
            { label: "Avg Call Duration",  value: fmtDur(kpis.avgDuration),                  sub: "all agents combined" },
            { label: "Positive Sentiment", value: `${positivePct}%`,                         sub: `${negativePct}% negative` },
            { label: "Active Agents",      value: `${kpis.activeAgents}`,                    sub: `${stars.length} star · ${underperformers.length} flagged` },
          ].map((kpi) => (
            <div key={kpi.label} style={{ border: "1px solid #e5e7eb", padding: "0.875rem 1rem", background: "#fafafa" }}>
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.6rem", fontFamily: "monospace", letterSpacing: "0.15em", color: "#9ca3af", textTransform: "uppercase" }}>{kpi.label}</p>
              <p style={{ margin: "0 0 0.2rem", fontSize: "1.35rem", fontWeight: 800, lineHeight: 1.1, fontFamily: "system-ui, sans-serif", letterSpacing: "-0.02em" }}>{kpi.value}</p>
              <p style={{ margin: 0, fontSize: "0.7rem", color: "#6b7280", fontFamily: "system-ui, sans-serif" }}>{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* Outcomes row */}
        <div style={{ display: "flex", gap: "0.5rem", fontFamily: "system-ui, sans-serif", fontSize: "0.75rem" }}>
          {[
            { label: "Resolved",     n: kpis.outcomes.resolved,  color: "#166534", bg: "#f0fdf4" },
            { label: "Follow-up",    n: kpis.outcomes.follow_up, color: "#92400e", bg: "#fffbeb" },
            { label: "Escalated",    n: kpis.outcomes.escalated, color: "#991b1b", bg: "#fef2f2" },
          ].map((o) => (
            <div key={o.label} style={{ flex: 1, padding: "0.5rem 0.75rem", background: o.bg, borderRadius: "4px", textAlign: "center" }}>
              <span style={{ fontWeight: 700, color: o.color }}>{o.n.toLocaleString()}</span>
              <span style={{ color: "#6b7280", marginLeft: "0.35rem" }}>{o.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── § 02 — Executive Narrative ── */}
      <Section num="02" title="Executive Summary">
        {narrative.split("\n\n").filter(Boolean).map((para, i) => (
          <p key={i} style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "#1f2937", textAlign: "justify" }}>
            {para}
          </p>
        ))}
      </Section>

      {/* ── § 03 — Stars & Strugglers ── */}
      {(stars.length > 0 || underperformers.length > 0 || watches.length > 0) && (
        <Section num="03" title="Stars &amp; Strugglers">

          {/* Stars + Underperformers grid */}
          {(stars.length > 0 || underperformers.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: watches.length > 0 ? "1.25rem" : 0 }}>
              {stars.map((a) => (
                <div key={a.name} style={{ border: "1px solid #86efac", padding: "1rem", background: "#f0fdf4" }}>
                  <p style={{ margin: "0 0 0.25rem", fontSize: "0.65rem", fontFamily: "monospace", letterSpacing: "0.15em", color: "#16a34a" }}>★ STAR</p>
                  <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.95rem", fontFamily: "system-ui" }}>{a.name}</p>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#374151", fontFamily: "system-ui" }}>
                    {a.calls} calls · {a.activeDays} active day{a.activeDays !== 1 ? "s" : ""} · {fmtMoney(a.revenue)} revenue
                  </p>
                  <div style={{ display: "flex", gap: "1rem", fontFamily: "system-ui", fontSize: "0.75rem" }}>
                    <div><span style={{ color: "#6b7280" }}>Score </span><strong>{a.avgScore.toFixed(1)}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Conv. </span><strong>{Math.round(a.conversionRate * 100)}%</strong></div>
                    <div><span style={{ color: "#6b7280" }}>$/hr </span><strong>${Math.round(a.revenuePerHour)}</strong></div>
                  </div>
                </div>
              ))}
              {underperformers.map((a) => (
                <div key={a.name} style={{ border: "1px solid #fca5a5", padding: "1rem", background: "#fef2f2" }}>
                  <p style={{ margin: "0 0 0.25rem", fontSize: "0.65rem", fontFamily: "monospace", letterSpacing: "0.15em", color: "#dc2626" }}>⚠ FLAGGED</p>
                  <p style={{ margin: "0 0 0.5rem", fontWeight: 700, fontSize: "0.95rem", fontFamily: "system-ui" }}>{a.name}</p>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.75rem", color: "#374151", fontFamily: "system-ui" }}>
                    {a.calls} calls · score {a.avgScore.toFixed(1)}/5 · {Math.round(a.conversionRate * 100)}% conversion
                  </p>
                  <div style={{ display: "flex", gap: "1rem", fontFamily: "system-ui", fontSize: "0.75rem" }}>
                    <div><span style={{ color: "#6b7280" }}>Eff </span><strong>{a.avgEfficiency.toFixed(1)}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Comm </span><strong>{a.avgCommunication.toFixed(1)}</strong></div>
                    <div><span style={{ color: "#6b7280" }}>Res </span><strong>{a.avgResolution.toFixed(1)}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Watch / On Radar — separate row, smaller cards */}
          {watches.length > 0 && (
            <div>
              <p style={{ margin: "0 0 0.6rem", fontSize: "0.62rem", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.18em", color: "#92400e", textTransform: "uppercase" }}>
                On Radar
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.6rem" }}>
                {watches.map((a) => (
                  <div key={a.name} style={{ border: "1px solid #fcd34d", padding: "0.75rem", background: "#fffbeb" }}>
                    <p style={{ margin: "0 0 0.3rem", fontWeight: 700, fontSize: "0.82rem", fontFamily: "system-ui" }}>{a.name}</p>
                    <p style={{ margin: "0 0 0.5rem", fontSize: "0.7rem", color: "#92400e", fontFamily: "system-ui" }}>
                      {a.calls} calls · {Math.round(a.conversionRate * 100)}% conv
                    </p>
                    <div style={{ display: "flex", gap: "0.75rem", fontFamily: "system-ui", fontSize: "0.7rem", color: "#6b7280" }}>
                      <span>Score <strong style={{ color: "#111" }}>{a.avgScore.toFixed(1)}</strong></span>
                      <span>$/call <strong style={{ color: "#111" }}>{fmtMoney(a.revenuePerCall)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </Section>
      )}

      {/* ── § 04 — Agent Scorecard ── */}
      <Section num="04" title="Full Agent Scorecard">
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif", fontSize: "0.75rem" }}>
          <thead>
            <tr style={{ background: "#111", color: "#fff" }}>
              {["#", "Agent", "Calls", "Revenue", "$/call", "Conv%", "Score", "Eff/Comm/Res", "Status"].map((h) => (
                <th key={h} style={{ padding: "0.5rem 0.6rem", textAlign: h === "#" || h === "Agent" ? "left" : "right", fontWeight: 600, letterSpacing: "0.05em", fontSize: "0.65rem", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => {
              const style = STATUS_STYLES[a.status] ?? STATUS_STYLES.solid;
              return (
                <tr key={a.name} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "0.5rem 0.6rem", color: "#9ca3af", fontFamily: "monospace" }}>{String(i + 1).padStart(2, "0")}</td>
                  <td style={{ padding: "0.5rem 0.6rem", fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontFamily: "monospace" }}>{a.calls}</td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(a.revenue)}</td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(a.revenuePerCall)}</td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontFamily: "monospace" }}>{Math.round(a.conversionRate * 100)}%</td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontWeight: 700, color: a.avgScore >= 4 ? "#166534" : a.avgScore < 3 ? "#dc2626" : "#111" }}>
                    {a.avgScore.toFixed(1)}
                  </td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right", fontFamily: "monospace", color: "#6b7280", whiteSpace: "nowrap" }}>
                    {a.avgEfficiency.toFixed(1)} / {a.avgCommunication.toFixed(1)} / {a.avgResolution.toFixed(1)}
                  </td>
                  <td style={{ padding: "0.5rem 0.6rem", textAlign: "right" }}>
                    <span style={{ display: "inline-block", padding: "0.15rem 0.5rem", borderRadius: "3px", fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.05em", background: style.bg, color: style.color, border: `1px solid ${style.border}`, whiteSpace: "nowrap" }}>
                      {style.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      {/* ── § 05 — Daily Volume ── */}
      <Section num="05" title="Daily Volume &amp; Revenue">
        <div style={{ marginBottom: "0.75rem", fontFamily: "system-ui", fontSize: "0.75rem", color: "#6b7280" }}>
          Peak day: <strong style={{ color: "#111" }}>{peakDay?.label}</strong> with {peakDay?.calls} calls.
          {" "}Total period revenue: <strong style={{ color: "#111" }}>{fmtMoney(totalDailyRevenue)}</strong>.
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif", fontSize: "0.73rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #111" }}>
              {["Day", "Calls", "", "Revenue", "", "Sales"].map((h, i) => (
                <th key={i} style={{ padding: "0.4rem 0.5rem", textAlign: i < 2 ? "left" : "right", fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dailyBreakdown.map((d, i) => (
              <tr key={d.date} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600 }}>{d.label}</td>
                <td style={{ padding: "0.4rem 0.5rem", fontFamily: "monospace" }}>{d.calls}</td>
                <td style={{ padding: "0.4rem 0.5rem", width: "120px" }}>
                  <div style={{ height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.calls / maxCalls) * 100}%`, background: "#111", borderRadius: "3px" }} />
                  </div>
                </td>
                <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(d.revenue)}</td>
                <td style={{ padding: "0.4rem 0.5rem", width: "100px" }}>
                  <div style={{ height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(d.revenue / maxRevenue) * 100}%`, background: "#16a34a", borderRadius: "3px" }} />
                  </div>
                </td>
                <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{d.sales}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ── § 06 — Category Breakdown ── */}
      {categories.length > 0 && (
        <Section num="06" title="Category Breakdown">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif", fontSize: "0.73rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #111" }}>
                {["Category", "Calls", "Share", "Revenue"].map((h) => (
                  <th key={h} style={{ padding: "0.4rem 0.5rem", textAlign: h === "Category" ? "left" : "right", fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c, i) => (
                <tr key={c.name} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600, textTransform: "capitalize" }}>{c.name}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{c.count}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{c.pct}%</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── § 07 — Missed Opportunities ── */}
      {missedOpportunities.length > 0 && (
        <Section num="07" title="Missed Sales Opportunities">
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif", fontSize: "0.73rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #111" }}>
                {["Agent", "Opportunities", "Converted", "Missed", "Conv. Rate"].map((h) => (
                  <th key={h} style={{ padding: "0.4rem 0.5rem", textAlign: h === "Agent" ? "left" : "right", fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {missedOpportunities.map((m, i) => (
                <tr key={m.name} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                  <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600 }}>{m.name}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace" }}>{m.opportunities}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", color: "#166534" }}>{m.converted}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", color: m.missed > 3 ? "#dc2626" : "#374151", fontWeight: m.missed > 3 ? 700 : 400 }}>{m.missed}</td>
                  <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: m.rate >= 60 ? "#166534" : m.rate < 30 ? "#dc2626" : "#92400e" }}>{m.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* ── § 08 — Recommendations ── */}
      {recommendations.length > 0 && (() => {
        // Split into people vs operations; older reports without category fall into people
        const peopleRecs = recommendations.filter((r) => !r.category || r.category === "people");
        const opsRecs    = recommendations.filter((r) => r.category === "operations");
        const hasSplit   = opsRecs.length > 0;

        const RecCard = ({ r }: { r: typeof recommendations[number] }) => (
          <div style={{ display: "flex", gap: "1rem", padding: "0.875rem 1rem", border: "1px solid #e5e7eb", background: "#fafafa" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
              <span style={{ fontFamily: "monospace", fontSize: "1rem", fontWeight: 800, lineHeight: 1 }}>{r.rank}</span>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: IMPACT_DOT[r.impact] ?? "#6b7280", flexShrink: 0 }} />
            </div>
            <div>
              <p style={{ margin: "0 0 0.3rem", fontFamily: "system-ui", fontWeight: 700, fontSize: "0.82rem" }}>{r.title}</p>
              <p style={{ margin: 0, fontFamily: "system-ui", fontSize: "0.78rem", color: "#374151", lineHeight: 1.55 }}>{r.detail}</p>
            </div>
          </div>
        );

        return (
          <Section num="08" title="Recommendations">
            {hasSplit ? (
              <>
                {/* People sub-section */}
                {peopleRecs.length > 0 && (
                  <div style={{ marginBottom: "1.5rem" }}>
                    <p style={{ margin: "0 0 0.75rem", fontFamily: "system-ui", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#374151" }}>
                      People
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {peopleRecs.map((r) => <RecCard key={r.rank} r={r} />)}
                    </div>
                  </div>
                )}

                {/* Operations sub-section */}
                {opsRecs.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <p style={{ margin: "0 0 0.75rem", fontFamily: "system-ui", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#374151" }}>
                      Operations
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {opsRecs.map((r) => <RecCard key={r.rank} r={r} />)}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Older report: no category field, render flat
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                {recommendations.map((r) => <RecCard key={r.rank} r={r} />)}
              </div>
            )}

            {/* Legend */}
            <div style={{ display: "flex", gap: "1.25rem", fontFamily: "system-ui", fontSize: "0.68rem", color: "#9ca3af" }}>
              {Object.entries(IMPACT_DOT).map(([label, color]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: color, display: "inline-block" }} />
                  {label.charAt(0).toUpperCase() + label.slice(1)} impact
                </span>
              ))}
            </div>
          </Section>
        );
      })()}

      {/* ── § 09 — Period Comparison ── */}
      {priorReport && (comparison_narrative || true) && (() => {
        const p = priorReport.snapshot;

        // KPI delta helpers
        const pctChange = (curr: number, prev: number) => {
          if (prev === 0) return { label: "—", positive: null };
          const d = ((curr - prev) / prev * 100);
          return { label: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, positive: d > 0 };
        };
        const ppChange = (curr: number, prev: number) => {
          const d = curr - prev;
          return { label: `${d >= 0 ? "+" : ""}${d.toFixed(1)}pp`, positive: d > 0 };
        };
        const absChange = (curr: number, prev: number) => {
          const d = curr - prev;
          return { label: `${d >= 0 ? "+" : ""}${d.toFixed(0)}`, positive: d > 0 };
        };
        const durChange = (curr: number, prev: number) => {
          const d = curr - prev;
          const sign = d >= 0 ? "+" : "-";
          const abs = Math.abs(d);
          return { label: `${sign}${Math.floor(abs / 60)}m${abs % 60}s`, positive: d < 0 }; // shorter = better
        };

        const deltaColor = (positive: boolean | null) =>
          positive === null ? "#9ca3af" : positive ? "#166534" : "#dc2626";
        const deltaArrow = (positive: boolean | null) =>
          positive === null ? "" : positive ? " ↑" : " ↓";

        const kpiRows: { label: string; prior: string; curr: string; delta: { label: string; positive: boolean | null } }[] = [
          { label: "Total Calls",     prior: p.kpis.totalCalls.toLocaleString(),                         curr: kpis.totalCalls.toLocaleString(),                         delta: absChange(kpis.totalCalls, p.kpis.totalCalls) },
          { label: "Total Revenue",   prior: fmtMoney(p.kpis.totalRevenue),                              curr: fmtMoney(kpis.totalRevenue),                              delta: pctChange(kpis.totalRevenue, p.kpis.totalRevenue) },
          { label: "Revenue / Call",  prior: fmtMoney(p.kpis.avgRevenuePerCall),                         curr: fmtMoney(kpis.avgRevenuePerCall),                         delta: pctChange(kpis.avgRevenuePerCall, p.kpis.avgRevenuePerCall) },
          { label: "Conversion Rate", prior: `${p.kpis.conversionRate}%`,                                curr: `${kpis.conversionRate}%`,                                delta: ppChange(kpis.conversionRate, p.kpis.conversionRate) },
          { label: "Avg Duration",    prior: fmtDur(p.kpis.avgDuration),                                curr: fmtDur(kpis.avgDuration),                                delta: durChange(kpis.avgDuration, p.kpis.avgDuration) },
          { label: "Active Agents",   prior: p.kpis.activeAgents.toString(),                             curr: kpis.activeAgents.toString(),                             delta: absChange(kpis.activeAgents, p.kpis.activeAgents) },
        ];

        // Agent status changes
        const priorMap = new Map(p.agents.map((a) => [a.name, a]));
        const currentNames = new Set(agents.map((a) => a.name));
        const statusChanges = agents
          .filter((a) => priorMap.has(a.name) && priorMap.get(a.name)!.status !== a.status)
          .map((a) => ({ name: a.name, from: priorMap.get(a.name)!.status, to: a.status }));
        const newAgents      = agents.filter((a) => !priorMap.has(a.name)).map((a) => a.name);
        const departedAgents = p.agents.filter((a) => !currentNames.has(a.name)).map((a) => a.name);
        const hasAgentChanges = statusChanges.length > 0 || newAgents.length > 0 || departedAgents.length > 0;

        const STATUS_COLOR: Record<string, string> = {
          star: "#16a34a", solid: "#374151", watch: "#92400e", underperformer: "#dc2626",
        };

        return (
          <Section num="09" title={`Period Comparison — vs "${priorReport.title}"`}>

            {/* KPI side-by-side table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "system-ui, sans-serif", fontSize: "0.73rem", marginBottom: "1.25rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #111" }}>
                  {["Metric", fmtShort(priorReport.period_start) + " – " + fmtShort(priorReport.period_end), fmtShort(snapshot.period.start) + " – " + fmtShort(snapshot.period.end), "Change"].map((h, i) => (
                    <th key={i} style={{ padding: "0.4rem 0.5rem", textAlign: i === 0 ? "left" : "right", fontWeight: 600, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kpiRows.map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", color: "#6b7280" }}>{row.prior}</td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{row.curr}</td>
                    <td style={{ padding: "0.4rem 0.5rem", textAlign: "right", fontFamily: "monospace", fontWeight: 700, color: deltaColor(row.delta.positive) }}>
                      {row.delta.label}{deltaArrow(row.delta.positive)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* AI comparison narrative */}
            {comparison_narrative && (
              <div style={{ marginBottom: hasAgentChanges ? "1.25rem" : 0 }}>
                {comparison_narrative.split("\n\n").filter(Boolean).map((para, i) => (
                  <p key={i} style={{ margin: "0 0 0.9rem", fontSize: "0.875rem", color: "#1f2937", textAlign: "justify" }}>{para}</p>
                ))}
              </div>
            )}

            {/* Agent changes */}
            {hasAgentChanges && (
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "1rem" }}>
                <p style={{ margin: "0 0 0.6rem", fontFamily: "system-ui", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#6b7280" }}>Agent Changes</p>
                <div style={{ fontFamily: "system-ui", fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {statusChanges.map((c) => (
                    <div key={c.name} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <strong>{c.name}</strong>
                      <span style={{ color: STATUS_COLOR[c.from] ?? "#374151" }}>{c.from}</span>
                      <span style={{ color: "#9ca3af" }}>→</span>
                      <span style={{ color: STATUS_COLOR[c.to] ?? "#374151", fontWeight: 700 }}>{c.to}</span>
                    </div>
                  ))}
                  {newAgents.length > 0 && (
                    <div style={{ color: "#374151" }}>
                      <strong>New this period:</strong> {newAgents.join(", ")}
                    </div>
                  )}
                  {departedAgents.length > 0 && (
                    <div style={{ color: "#6b7280" }}>
                      <strong>Not in this period:</strong> {departedAgents.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            )}

          </Section>
        );
      })()}

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #e5e7eb", paddingTop: "1rem", marginTop: "2rem", display: "flex", justifyContent: "space-between", fontFamily: "monospace", fontSize: "0.65rem", color: "#9ca3af" }}>
        <span>Kolas Intelligence · Call Center Report</span>
        <span>Source: calls · {fmtShort(snapshot.period.start)} – {fmtShort(snapshot.period.end)} · Generated {new Date(report.generated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
      </footer>

    </div>
  );
}
