"use client";

import { useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronDown, X, Search, ArrowDown, ArrowUp, Calendar } from "lucide-react";
import { type CallRecord } from "@/lib/supabase";
import { TZ, todayPacific, dateToPacificStr } from "@/lib/timezone";

export type FilterState = {
  search: string;
  store: string;
  agent: string;
  category: string;
  sentiment: string;
  outcome: string;
  salesActivity: string;
  orderType: string;
  dateRange: "all" | "today" | "yesterday" | "3d" | "5d" | "custom";
  customDateFrom: string;
  customDateTo: string;
  timeSort: "desc" | "asc";
};

type Props = {
  calls: CallRecord[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};

const ALL = "__all__";

const DATE_PRESETS: { value: FilterState["dateRange"]; label: string }[] = [
  { value: "all",       label: "All time"   },
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

function FilterCombobox({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const isActive = value !== ALL;
  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-all cursor-pointer select-none ${
          isActive
            ? "bg-primary/8 border-primary/30 text-primary font-medium"
            : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
        }`}
      >
        <span>{isActive ? selectedLabel : label}</span>
        {isActive ? (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onValueChange(ALL); }}
            className="ml-0.5 rounded hover:bg-primary/15 p-0.5 -mr-0.5 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </span>
        ) : (
          <ChevronDown className="w-3 h-3 opacity-40" />
        )}
      </PopoverTrigger>

      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  data-checked={value === o.value}
                  onSelect={() => onValueChange(value === o.value ? ALL : o.value)}
                  className="text-xs"
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const SENTIMENTS = [
  { value: "positive", label: "Positive", color: "oklch(0.59 0.17 148)" },
  { value: "neutral",  label: "Neutral",  color: "oklch(0.55 0.04 258)" },
  { value: "negative", label: "Negative", color: "oklch(0.56 0.21 20)"  },
];

const OUTCOMES = [
  { value: "resolved",         label: "Resolved",   color: "oklch(0.59 0.17 148)" },
  { value: "follow_up_needed", label: "Follow-up",  color: "oklch(0.60 0.17 60)"  },
  { value: "escalated",        label: "Escalated",  color: "oklch(0.56 0.21 20)"  },
];

export function Filters({ calls, filters, onChange }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  // Wire "/" key to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const stores     = [...new Set(calls.map((c) => c.store).filter((v): v is string => !!v))];
  const agents     = [...new Set(calls.map((c) => c.agent_name).filter((v): v is string => !!v))];
  const categories = [...new Set(calls.map((c) => c.category).filter((v): v is string => !!v))];

  // timeSort is not counted as an "active filter" — it's a sort preference, not a narrowing filter
  const activeCount = [
    filters.store !== ALL,
    filters.agent !== ALL,
    filters.category !== ALL,
    filters.sentiment !== ALL,
    filters.outcome !== ALL,
    filters.salesActivity !== ALL,
    filters.orderType !== ALL,
    filters.dateRange !== "all",
  ].filter(Boolean).length;

  const hasFilters = !!filters.search || activeCount > 0;

  const customRangeCount = useMemo(() => {
    if (!filters.customDateFrom && !filters.customDateTo) return null;
    return calls.filter((c) => {
      if (!c.start_time) return false;
      const pd = dateToPacificStr(new Date(c.start_time));
      if (filters.customDateFrom && pd < filters.customDateFrom) return false;
      if (filters.customDateTo   && pd > filters.customDateTo)   return false;
      return true;
    }).length;
  }, [calls, filters.customDateFrom, filters.customDateTo]);

  return (
    <div className="flex flex-wrap items-center gap-2">

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
        <Input
          ref={searchRef}
          placeholder="Search calls…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-52 h-8 bg-card border-border text-xs pl-7 pr-6 placeholder:text-muted-foreground/40 focus-visible:border-primary/50 focus-visible:ring-0 transition-colors rounded-lg"
        />
        {!filters.search && (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-mono text-muted-foreground/30 border border-border rounded px-1 py-0.5">
            /
          </kbd>
        )}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Combobox filters */}
      <FilterCombobox
        label="Store"
        value={filters.store}
        onValueChange={(v) => onChange({ ...filters, store: v })}
        options={stores.sort().map((s) => ({ value: s, label: s }))}
      />
      <FilterCombobox
        label="Agent"
        value={filters.agent}
        onValueChange={(v) => onChange({ ...filters, agent: v })}
        options={agents.sort().map((a) => ({ value: a, label: a }))}
      />
      <FilterCombobox
        label="Outcome"
        value={filters.outcome}
        onValueChange={(v) => onChange({ ...filters, outcome: v })}
        options={OUTCOMES.map((o) => ({ value: o.value, label: o.label }))}
      />
      <FilterCombobox
        label="Category"
        value={filters.category}
        onValueChange={(v) => onChange({ ...filters, category: v })}
        options={categories.sort().map((c) => ({
          value: c,
          label: c.replace(/_/g, " "),
        }))}
      />
      <FilterCombobox
        label="Sales"
        value={filters.salesActivity}
        onValueChange={(v) => onChange({ ...filters, salesActivity: v })}
        options={[
          { value: "has_sale", label: "Has Sale" },
          { value: "upsell_attempted", label: "Upsell Attempted" },
          { value: "missed_upsell", label: "Missed Upsell" },
          { value: "no_sale", label: "No Sale" },
        ]}
      />
      <FilterCombobox
        label="Order Type"
        value={filters.orderType}
        onValueChange={(v) => onChange({ ...filters, orderType: v })}
        options={[
          { value: "Pickup", label: "Pickup" },
          { value: "Delivery", label: "Delivery" },
          { value: "Express Delivery", label: "Express Delivery" },
        ]}
      />

      <div className="h-5 w-px bg-border" />

      {/* Sentiment pill toggles */}
      <div className="flex items-center gap-1">
        {SENTIMENTS.map((s) => {
          const isActive = filters.sentiment === s.value;
          return (
            <button
              key={s.value}
              onClick={() => onChange({ ...filters, sentiment: isActive ? ALL : s.value })}
              className={`h-8 px-3 rounded-lg text-xs font-medium border cursor-pointer transition-all ${
                isActive
                  ? ""
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
              }`}
              style={
                isActive
                  ? { background: `${s.color}18`, color: s.color, borderColor: `${s.color}40` }
                  : {}
              }
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                style={{ background: isActive ? s.color : "currentColor", opacity: isActive ? 1 : 0.3 }}
              />
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="h-5 w-px bg-border" />

      {/* Sort order + date range — time-related controls grouped at end */}
      <button
        onClick={() => onChange({ ...filters, timeSort: filters.timeSort === "desc" ? "asc" : "desc" })}
        className="h-8 px-3 text-xs rounded-lg border cursor-pointer transition-all border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80 flex items-center gap-1.5"
      >
        {filters.timeSort === "desc"
          ? <ArrowDown className="w-3 h-3 opacity-60" />
          : <ArrowUp   className="w-3 h-3 opacity-60" />}
        {filters.timeSort === "desc" ? "Newest" : "Oldest"}
      </button>

      <div className="flex items-center gap-1">
        {DATE_PRESETS.map((d) => {
          const isActive = filters.dateRange === d.value;
          return (
            <button
              key={d.value}
              onClick={() => onChange({ ...filters, dateRange: d.value })}
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

        {/* Custom date range picker */}
        <Popover>
          <PopoverTrigger
            onClick={() => { if (filters.dateRange !== "custom") onChange({ ...filters, dateRange: "custom" }); }}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border transition-all cursor-pointer select-none ${
              filters.dateRange === "custom"
                ? "bg-primary/8 border-primary/30 text-primary font-medium"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-border/80"
            }`}
          >
            <Calendar className="w-3 h-3 opacity-60 shrink-0" />
            {filters.dateRange === "custom" && (filters.customDateFrom || filters.customDateTo) ? (
              <>
                {filters.customDateFrom ? fmtDate(filters.customDateFrom) : "…"}
                {" – "}
                {filters.customDateTo ? fmtDate(filters.customDateTo) : "…"}
                {customRangeCount !== null && (
                  <span className="font-mono text-[9px] opacity-55 ml-0.5">· {customRangeCount.toLocaleString()}</span>
                )}
              </>
            ) : "Custom"}
            {filters.dateRange === "custom" && (filters.customDateFrom || filters.customDateTo) && (
              <span
                role="button"
                onClick={(e) => { e.stopPropagation(); onChange({ ...filters, dateRange: "all", customDateFrom: "", customDateTo: "" }); }}
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
                  const isActive = filters.customDateFrom === r.from && filters.customDateTo === r.to;
                  return (
                    <button
                      key={key}
                      onClick={() => onChange({ ...filters, dateRange: "custom", customDateFrom: r.from, customDateTo: r.to })}
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
                  value={filters.customDateFrom}
                  max={filters.customDateTo || undefined}
                  onChange={(e) => onChange({ ...filters, dateRange: "custom", customDateFrom: e.target.value })}
                  className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/50 block">To</label>
                <input
                  type="date"
                  value={filters.customDateTo}
                  min={filters.customDateFrom || undefined}
                  onChange={(e) => onChange({ ...filters, dateRange: "custom", customDateTo: e.target.value })}
                  className="w-full h-8 px-2 text-xs rounded-lg border border-border bg-card text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
            </div>

            {/* Live count */}
            {customRangeCount !== null && (
              <p className="text-[10px] font-mono text-muted-foreground/50 text-right tabular-nums pt-0.5">
                {customRangeCount.toLocaleString()} call{customRangeCount !== 1 ? "s" : ""} in range
              </p>
            )}
          </PopoverContent>
        </Popover>
      </div>

      {/* Clear all */}
      {hasFilters && (
        <>
          <div className="h-5 w-px bg-border" />
          <button
            onClick={() =>
              onChange({ search: "", store: ALL, agent: ALL, category: ALL, sentiment: ALL, outcome: ALL, salesActivity: ALL, orderType: ALL, dateRange: "all", customDateFrom: "", customDateTo: "", timeSort: filters.timeSort })
            }
            className="h-8 px-2.5 text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3 h-3" />
            Clear{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </>
      )}
    </div>
  );
}

export function applyFilters(calls: CallRecord[], filters: FilterState): CallRecord[] {
  return calls.filter((c) => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      // Map outcome values to human labels for search matching
      const outcomeLabel = c.outcome === "follow_up_needed" ? "follow up" : (c.outcome ?? "");
      if (
        !(
          c.transcript?.toLowerCase().includes(q) ||
          c.summary?.toLowerCase().includes(q) ||
          c.customer_name?.toLowerCase().includes(q) ||
          c.agent_name?.toLowerCase().includes(q) ||
          c.outcome?.toLowerCase().includes(q) ||
          outcomeLabel.includes(q)
        )
      )
        return false;
    }
    if (filters.store !== ALL && c.store !== filters.store) return false;
    if (filters.agent !== ALL && c.agent_name !== filters.agent) return false;
    if (filters.category !== ALL && c.category !== filters.category) return false;
    if (filters.sentiment !== ALL && c.sentiment !== filters.sentiment) return false;
    if (filters.outcome !== ALL && c.outcome !== filters.outcome) return false;
    if (filters.orderType !== ALL && c.order_type !== filters.orderType) return false;
    if (filters.salesActivity !== ALL) {
      if (filters.salesActivity === "has_sale" && !(c.revenue != null && c.revenue > 0)) return false;
      if (filters.salesActivity === "upsell_attempted" && !c.upsell_attempted) return false;
      if (filters.salesActivity === "missed_upsell" && !(c.upsell_opportunities && !c.upsell_attempted)) return false;
      if (filters.salesActivity === "no_sale" && (c.revenue != null && c.revenue > 0)) return false;
    }

    if (filters.dateRange !== "all") {
      const startTime = c.start_time;
      if (!startTime) return false;
      const pacificDate = dateToPacificStr(new Date(startTime));
      if (filters.dateRange === "today") {
        if (pacificDate !== todayPacific()) return false;
      } else if (filters.dateRange === "yesterday") {
        const yesterday = dateToPacificStr(new Date(Date.now() - 86_400_000));
        if (pacificDate !== yesterday) return false;
      } else if (filters.dateRange === "custom") {
        if (filters.customDateFrom && pacificDate < filters.customDateFrom) return false;
        if (filters.customDateTo   && pacificDate > filters.customDateTo)   return false;
      } else {
        const days = filters.dateRange === "3d" ? 3 : 5;
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
        if (startTime < cutoff) return false;
      }
    }

    return true;
  });
}
