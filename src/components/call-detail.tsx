"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type CallRecord } from "@/lib/supabase";

type Props = {
  call: CallRecord | null;
  open: boolean;
  onClose: () => void;
  onProcess?: (recordingId: number) => void;
};

function sentimentColor(s: string | null) {
  if (s === "positive") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "negative") return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function outcomeColor(o: string | null) {
  if (o === "resolved") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (o === "follow_up_needed") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (o === "escalated") return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

export function CallDetail({ call, open, onClose, onProcess }: Props) {
  if (!call) return null;

  const time = call.start_time
    ? new Date(call.start_time).toLocaleString()
    : "Unknown time";

  const isDone = call.status === "done";
  const isProcessing = call.status === "processing";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-hidden p-0">
        <SheetHeader className="p-6 pb-0">
          <SheetTitle className="text-lg">Call #{call.recording_id}</SheetTitle>
          <p className="text-sm text-muted-foreground">{time}</p>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-5rem)] px-6 pb-6">
          <div className="space-y-5 pt-4">

            {/* Pending / processing / failed state */}
            {!isDone && (
              <>
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  {isProcessing ? (
                    <div className="flex items-center gap-2 text-sm text-blue-400">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                      </span>
                      Processing — transcribing &amp; analyzing...
                    </div>
                  ) : call.status === "failed" ? (
                    <div className="text-sm text-red-400">
                      Processing failed for this recording.
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      This recording has not been processed yet.
                    </div>
                  )}

                  {onProcess && !isProcessing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onProcess(call.recording_id);
                        onClose();
                      }}
                    >
                      {call.status === "failed" ? "Retry Processing" : "Process Now"}
                    </Button>
                  )}
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Caller</span>
                  <span className="font-mono">{call.caller_phone ?? "—"}</span>
                  <span className="text-muted-foreground">Callee</span>
                  <span className="font-mono">{call.callee_phone ?? "—"}</span>
                </div>
              </>
            )}

            {/* Done state — full detail */}
            {isDone && (
              <>
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {call.category && (
                    <Badge variant="outline" className="capitalize">
                      {call.category.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {call.sentiment && (
                    <Badge variant="outline" className={sentimentColor(call.sentiment)}>
                      {call.sentiment}
                    </Badge>
                  )}
                  {call.outcome && (
                    <Badge variant="outline" className={outcomeColor(call.outcome)}>
                      {call.outcome.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {call.language && call.language !== "en" && (
                    <Badge variant="outline">{call.language.toUpperCase()}</Badge>
                  )}
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {call.agent_name && (
                    <>
                      <span className="text-muted-foreground">Agent</span>
                      <span className="font-medium">{call.agent_name}</span>
                    </>
                  )}
                  {(call.customer_name || call.caller_phone) && (
                    <>
                      <span className="text-muted-foreground">Customer</span>
                      <span className="font-medium">
                        {call.customer_name ?? (
                          <span className="font-mono font-normal text-muted-foreground">
                            {call.caller_phone}
                          </span>
                        )}
                      </span>
                    </>
                  )}
                  {call.customer_name && call.caller_phone && (
                    <>
                      <span className="text-muted-foreground">Caller #</span>
                      <span className="font-mono text-sm text-muted-foreground">
                        {call.caller_phone}
                      </span>
                    </>
                  )}
                  {call.store && (
                    <>
                      <span className="text-muted-foreground">Store</span>
                      <span className="font-medium">{call.store}</span>
                    </>
                  )}
                  {call.order_type && (
                    <>
                      <span className="text-muted-foreground">Order Type</span>
                      <span className="font-medium capitalize">
                        {call.order_type.replace(/_/g, " ")}
                      </span>
                    </>
                  )}
                  {call.order_total && (
                    <>
                      <span className="text-muted-foreground">Order Total</span>
                      <span className="font-medium">{call.order_total}</span>
                    </>
                  )}
                  {call.payment_method && (
                    <>
                      <span className="text-muted-foreground">Payment</span>
                      <span className="font-medium capitalize">
                        {call.payment_method}
                      </span>
                    </>
                  )}
                </div>

                {/* Summary */}
                {call.summary && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Summary
                      </h4>
                      <p className="text-sm leading-relaxed">{call.summary}</p>
                    </div>
                  </>
                )}

                {/* Products */}
                {call.products && call.products.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Products Mentioned
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {call.products.map((p, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Points */}
                {call.key_points && call.key_points.length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Key Points
                      </h4>
                      <ul className="space-y-1.5">
                        {call.key_points.map((kp, i) => (
                          <li key={i} className="text-sm flex gap-2">
                            <span className="text-muted-foreground shrink-0">
                              &bull;
                            </span>
                            <span>{kp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                )}

                {/* Action Items */}
                {call.action_items && call.action_items.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Action Items
                    </h4>
                    <ul className="space-y-1.5">
                      {call.action_items.map((ai, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-amber-400 shrink-0">&#9744;</span>
                          <span>{ai}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Transcript */}
                {call.transcript && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Full Transcript
                      </h4>
                      <div className="rounded-md bg-muted/50 p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono text-xs">
                        {call.transcript}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="h-8" />
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
