"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { type CallRecord } from "@/lib/supabase";

export type FilterState = {
  search: string;
  store: string;
  agent: string;
  category: string;
  sentiment: string;
};

type Props = {
  calls: CallRecord[];
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};

const ALL = "__all__";

export function Filters({ calls, filters, onChange }: Props) {
  const stores = [...new Set(calls.map((c) => c.store).filter((v): v is string => !!v))];
  const agents = [...new Set(calls.map((c) => c.agent_name).filter((v): v is string => !!v))];
  const categories = [...new Set(calls.map((c) => c.category).filter((v): v is string => !!v))];

  const hasFilters =
    filters.search ||
    filters.store !== ALL ||
    filters.agent !== ALL ||
    filters.category !== ALL ||
    filters.sentiment !== ALL;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Search transcripts..."
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="w-64 h-9 bg-card"
      />
      <Select
        value={filters.store}
        onValueChange={(v) => onChange({ ...filters, store: v ?? ALL })}
      >
        <SelectTrigger className="w-[150px] h-9 bg-card">
          <SelectValue placeholder="Store" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Stores</SelectItem>
          {stores.sort().map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.agent}
        onValueChange={(v) => onChange({ ...filters, agent: v ?? ALL })}
      >
        <SelectTrigger className="w-[180px] h-9 bg-card">
          <SelectValue placeholder="Agent" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Agents</SelectItem>
          {agents.sort().map((a) => (
            <SelectItem key={a} value={a}>
              {a}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.category}
        onValueChange={(v) => onChange({ ...filters, category: v ?? ALL })}
      >
        <SelectTrigger className="w-[170px] h-9 bg-card">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Categories</SelectItem>
          {categories.sort().map((c) => (
            <SelectItem key={c} value={c}>
              {c.replace(/_/g, " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.sentiment}
        onValueChange={(v) => onChange({ ...filters, sentiment: v ?? ALL })}
      >
        <SelectTrigger className="w-[140px] h-9 bg-card">
          <SelectValue placeholder="Sentiment" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All Sentiment</SelectItem>
          <SelectItem value="positive">Positive</SelectItem>
          <SelectItem value="neutral">Neutral</SelectItem>
          <SelectItem value="negative">Negative</SelectItem>
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              search: "",
              store: ALL,
              agent: ALL,
              category: ALL,
              sentiment: ALL,
            })
          }
          className="text-muted-foreground"
        >
          Clear
        </Button>
      )}
    </div>
  );
}

export function applyFilters(
  calls: CallRecord[],
  filters: FilterState
): CallRecord[] {
  return calls.filter((c) => {
    if (
      filters.search &&
      !(
        c.transcript?.toLowerCase().includes(filters.search.toLowerCase()) ||
        c.summary?.toLowerCase().includes(filters.search.toLowerCase()) ||
        c.customer_name?.toLowerCase().includes(filters.search.toLowerCase()) ||
        c.agent_name?.toLowerCase().includes(filters.search.toLowerCase())
      )
    )
      return false;
    if (filters.store !== ALL && c.store !== filters.store) return false;
    if (filters.agent !== ALL && c.agent_name !== filters.agent) return false;
    if (filters.category !== ALL && c.category !== filters.category)
      return false;
    if (filters.sentiment !== ALL && c.sentiment !== filters.sentiment)
      return false;
    return true;
  });
}
