"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { type CallRecord } from "@/lib/supabase";
import { CallDetail } from "./call-detail";

type Props = {
  calls: CallRecord[];
  onProcess?: (recordingId: number) => void;
};

function sentimentDot(s: string | null) {
  if (s === "positive") return "bg-emerald-500";
  if (s === "negative") return "bg-red-500";
  return "bg-zinc-500";
}

function formatTime(t: string | null) {
  if (!t) return "—";
  const d = new Date(t);
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${mins}`;
}

function StatusBadge({ status }: { status: CallRecord["status"] }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/30">
        Pending
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
        </span>
        <span className="text-xs text-blue-400">Processing</span>
      </span>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="outline" className="text-xs text-red-400 border-red-500/30">
        Failed
      </Badge>
    );
  }
  return null;
}

export function CallsTable({ calls, onProcess }: Props) {
  const [selected, setSelected] = useState<CallRecord | null>(null);

  if (calls.length === 0) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        No calls found. Click &quot;Sync Recordings&quot; to fetch recordings.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">Time</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-[80px] text-center">Sentiment</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead className="w-[45%]">Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((call) => {
              const isDone = call.status === "done";
              return (
                <TableRow
                  key={call.recording_id}
                  className="cursor-pointer"
                  onClick={() => setSelected(call)}
                >
                  <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {formatTime(call.start_time)}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {call.agent_name
                      ? call.agent_name.split(" ").slice(0, 2).join(" ") + ` - ${call.callee_phone}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {isDone
                      ? call.customer_name
                        ? call.customer_name
                        : <span className="font-mono text-xs text-muted-foreground">{call.caller_phone ?? "—"}</span>
                      : call.caller_phone
                      ? <span className="font-mono text-xs text-muted-foreground">{call.caller_phone}</span>
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {isDone ? (call.store ?? "—") : "—"}
                  </TableCell>
                  <TableCell>
                    {isDone && call.category ? (
                      <Badge
                        variant="secondary"
                        className="text-xs capitalize font-normal"
                      >
                        {call.category.replace(/_/g, " ")}
                      </Badge>
                    ) : !isDone ? (
                      <StatusBadge status={call.status} />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    {isDone ? (
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${sentimentDot(call.sentiment)}`}
                        title={call.sentiment ?? ""}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {isDone && call.outcome && (
                      <span className="text-xs text-muted-foreground capitalize">
                        {call.outcome.replace(/_/g, " ")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                    {isDone ? (call.summary ?? "—") : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CallDetail
        call={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onProcess={onProcess}
      />
    </>
  );
}
