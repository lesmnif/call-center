export type AgentReport = {
  name: string;
  calls: number;
  revenue: number;
  conversionRate: number;      // 0–1
  avgScore: number;            // composite (eff+comm+res)/3
  avgEfficiency: number;
  avgCommunication: number;
  avgResolution: number;
  salesClosed: number;
  opportunities: number;
  missedUpsells: number;
  avgDuration: number;         // seconds
  revenuePerHour: number;
  revenuePerCall: number;
  salesPerDay: number;
  activeDays: number;
  status: "star" | "solid" | "watch" | "underperformer";
};

export type DayReport = {
  date: string;   // YYYY-MM-DD
  label: string;  // "Mon 6"
  calls: number;
  processedCalls: number;
  revenue: number;
  sales: number;
};

export type CategoryReport = {
  name: string;
  count: number;
  revenue: number;
  pct: number;
};

export type MissedOpportunity = {
  name: string;
  opportunities: number;
  converted: number;
  missed: number;
  rate: number;  // 0–100
};

export type ReportSnapshot = {
  period: { start: string; end: string; days: number };
  kpis: {
    totalCalls: number;
    processedCalls: number;
    totalRevenue: number;
    avgRevenuePerCall: number;
    conversionRate: number;   // 0–100
    opportunities: number;
    salesClosed: number;
    avgDuration: number;      // seconds
    sentiment: { positive: number; neutral: number; negative: number };
    outcomes: { resolved: number; follow_up: number; escalated: number };
    activeAgents: number;
  };
  agents: AgentReport[];
  categories: CategoryReport[];
  dailyBreakdown: DayReport[];
  missedOpportunities: MissedOpportunity[];
};

export type ReportRecommendation = {
  rank: number;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  // Optional for backward-compat with older saved reports
  category?: "people" | "operations";
};

export type ReportRecord = {
  id: string;
  title: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  snapshot: ReportSnapshot;
  narrative: string;
  recommendations: ReportRecommendation[];
  prior_report_id: string | null;
  comparison_narrative: string | null;
};
