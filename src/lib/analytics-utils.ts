import { type CallRecord } from "@/lib/supabase";
import { TZ } from "@/lib/timezone";

export type Period = "daily" | "weekly" | "monthly";

/** Group calls by period — returns Map<label, calls> sorted chronologically */
export function groupByPeriod(calls: CallRecord[], period: Period): Map<string, CallRecord[]> {
  // Sort ascending first so Map insertion order is chronological
  const sorted = [...calls].sort((a, b) => {
    if (!a.start_time || !b.start_time) return 0;
    return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
  });

  const map = new Map<string, CallRecord[]>();
  for (const c of sorted) {
    if (!c.start_time) continue;
    const d = new Date(c.start_time);
    let key: string;
    if (period === "daily") {
      key = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
    } else if (period === "weekly") {
      // Week starting Monday
      const pacific = new Date(d.toLocaleString("en-US", { timeZone: TZ }));
      const day = pacific.getDay();
      const diff = pacific.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(pacific.setDate(diff));
      key = `Wk ${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    } else {
      key = d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: TZ });
    }
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}

/** Get hour of day in Pacific time (0-23) */
export function getHourPacific(call: CallRecord): number | null {
  if (!call.start_time) return null;
  const d = new Date(call.start_time);
  return parseInt(d.toLocaleTimeString("en-US", { hour: "2-digit", hour12: false, timeZone: TZ }));
}

/** Get day of week in Pacific time */
export function getDayOfWeekPacific(call: CallRecord): string | null {
  if (!call.start_time) return null;
  return new Date(call.start_time).toLocaleDateString("en-US", { weekday: "short", timeZone: TZ });
}

/** Compute average duration in seconds for calls that have duration */
export function computeAvgDuration(calls: CallRecord[]): number {
  const withDur = calls.filter(c => c.duration_seconds != null);
  if (withDur.length === 0) return 0;
  return Math.round(withDur.reduce((s, c) => s + c.duration_seconds!, 0) / withDur.length);
}

/** Format seconds to M:SS */
export function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
