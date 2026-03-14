"use client";

import { Card, CardContent } from "@/components/ui/card";
import { type CallRecord } from "@/lib/supabase";

type Props = { calls: CallRecord[] };

export function StatsRow({ calls }: Props) {
  const total = calls.length;

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = calls.filter((c) =>
    c.start_time?.startsWith(today)
  ).length;

  const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
  for (const c of calls) {
    const s = c.sentiment as keyof typeof sentimentCounts;
    if (s in sentimentCounts) sentimentCounts[s]++;
  }

  const categoryCounts: Record<string, number> = {};
  for (const c of calls) {
    if (c.category) categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
  }
  const topCategory = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const storeCounts: Record<string, number> = {};
  for (const c of calls) {
    if (c.store) storeCounts[c.store] = (storeCounts[c.store] ?? 0) + 1;
  }
  const topStore = Object.entries(storeCounts).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const stats = [
    { label: "Total Calls", value: total, sub: null },
    { label: "Today", value: todayCount, sub: null },
    {
      label: "Sentiment",
      value: null,
      sub: (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-400">{sentimentCounts.positive} pos</span>
          <span className="text-zinc-400">{sentimentCounts.neutral} neu</span>
          <span className="text-red-400">{sentimentCounts.negative} neg</span>
        </div>
      ),
    },
    {
      label: "Top Category",
      value: topCategory
        ? topCategory[0].replace(/_/g, " ")
        : "—",
      sub: topCategory ? `${topCategory[1]} calls` : null,
    },
    {
      label: "Top Store",
      value: topStore ? topStore[0] : "—",
      sub: topStore ? `${topStore[1]} calls` : null,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map((s) => (
        <Card key={s.label} className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {s.label}
            </p>
            {s.value !== null && (
              <p className="text-2xl font-semibold mt-1 capitalize">{s.value}</p>
            )}
            {s.sub && (typeof s.sub === "string" ? (
              <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
            ) : (
              <div className="mt-2">{s.sub}</div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
