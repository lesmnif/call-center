"use client";

import { useEffect, useRef } from "react";
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
import { ChevronDown, X, Search, ArrowDown, ArrowUp } from "lucide-react";
import { type CallRecord } from "@/lib/supabase";

export type FilterState = {
  search: string;
  store: string;
  agent: string;
  category: string;
  sentiment: string;
  outcome: string;
  dateRange: "all" | "today" | "7d" | "30d";
  timeSort: "desc" | "asc";
};

type Props = {
  calls: CallRecord[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};

const ALL = "__all__";

const DATE_RANGES: { value: FilterState["dateRange"]; label: string }[] = [
  { value: "all",   label: "All time" },
  { value: "today", label: "Today"    },
  { value: "7d",    label: "7 days"   },
  { value: "30d",   label: "30 days"  },
];

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
    filters.dateRange !== "all",
  ].filter(Boolean).length;

  const hasFilters = !!filters.search || activeCount > 0;

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
        {DATE_RANGES.map((d) => {
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
      </div>

      {/* Clear all */}
      {hasFilters && (
        <>
          <div className="h-5 w-px bg-border" />
          <button
            onClick={() =>
              onChange({ search: "", store: ALL, agent: ALL, category: ALL, sentiment: ALL, outcome: ALL, dateRange: "all", timeSort: filters.timeSort })
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

    if (filters.dateRange !== "all") {
      const startTime = c.start_time;
      if (!startTime) return false;
      if (filters.dateRange === "today") {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (!startTime.startsWith(todayStr)) return false;
      } else {
        const days = filters.dateRange === "7d" ? 7 : 30;
        const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
        if (startTime < cutoff) return false;
      }
    }

    return true;
  });
}
