"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type CallRecord } from "@/lib/supabase";

type Props = {
  call: CallRecord | null;
  open: boolean;
  onClose: () => void;
  onProcess?: (recordingId: number) => void;
};

const SENTIMENT = {
  positive: { label: "Positive", color: "oklch(0.46 0.17 148)", bg: "oklch(0.59 0.17 148 / 0.1)", border: "oklch(0.59 0.17 148 / 0.25)", bar: "oklch(0.59 0.17 148)" },
  negative: { label: "Negative", color: "oklch(0.46 0.21 20)",  bg: "oklch(0.56 0.21 20 / 0.1)",  border: "oklch(0.56 0.21 20 / 0.25)",  bar: "oklch(0.56 0.21 20)"  },
  neutral:  { label: "Neutral",  color: "oklch(0.42 0.04 258)", bg: "oklch(0.55 0.04 258 / 0.08)", border: "oklch(0.55 0.04 258 / 0.2)", bar: "oklch(0.55 0.04 258)"  },
};

const OUTCOME = {
  resolved:         { label: "Resolved",  color: "oklch(0.46 0.17 148)", bg: "oklch(0.59 0.17 148 / 0.1)", border: "oklch(0.59 0.17 148 / 0.3)" },
  follow_up_needed: { label: "Follow-up", color: "oklch(0.50 0.17 60)",  bg: "oklch(0.72 0.15 60 / 0.1)",  border: "oklch(0.72 0.15 60 / 0.3)"  },
  escalated:        { label: "Escalated", color: "oklch(0.46 0.21 20)",  bg: "oklch(0.56 0.21 20 / 0.1)",  border: "oklch(0.56 0.21 20 / 0.3)"  },
};

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50">{label}</p>
      <div className="text-[13px] font-medium text-foreground/85">{children}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50 mb-3">{children}</p>
  );
}

export function CallDetail({ call, open, onClose, onProcess }: Props) {
  const [copied, setCopied] = useState(false);

  if (!call) return null;

  const time = call.start_time
    ? new Date(call.start_time).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
      })
    : "Unknown time";

  const isDone       = call.status === "done";
  const isProcessing = call.status === "processing";

  const sentimentKey = (call.sentiment ?? "") as keyof typeof SENTIMENT;
  const sentiment    = isDone && sentimentKey in SENTIMENT ? SENTIMENT[sentimentKey] : null;

  const outcomeKey = (call.outcome ?? "") as keyof typeof OUTCOME;
  const outcome    = isDone && outcomeKey in OUTCOME ? OUTCOME[outcomeKey] : null;

  const topBarColor = sentiment?.bar ?? (isProcessing ? "oklch(0.56 0.23 275)" : "oklch(0.90 0.006 258)");

  const handleCopy = async () => {
    if (call.transcript) {
      await navigator.clipboard.writeText(call.transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={true}
        className="sm:max-w-[900px] p-0 gap-0 overflow-hidden flex flex-col max-h-[92vh] rounded-2xl"
      >
        {/* Sentiment color bar */}
        <div className="h-1 w-full shrink-0" style={{ background: topBarColor }} />

        {/* Header */}
        <div className="px-7 pt-5 pb-5 border-b border-border bg-card shrink-0 pr-14">
          <DialogTitle className="sr-only">Recording #{call.recording_id}</DialogTitle>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-[12px] font-mono text-muted-foreground/50">
                  #{call.recording_id}
                </span>
                {sentiment && (
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={{ color: sentiment.color, background: sentiment.bg, borderColor: sentiment.border }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: sentiment.bar }} />
                    {sentiment.label}
                  </span>
                )}
                {outcome && (
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border"
                    style={{ color: outcome.color, background: outcome.bg, borderColor: outcome.border }}
                  >
                    {outcome.label}
                  </span>
                )}
                {isDone && call.language && call.language !== "en" && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border border-border text-muted-foreground/60">
                    {call.language.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground/60 font-mono">{time}</p>
            </div>

            {!isDone && !isProcessing && onProcess && (
              <button
                onClick={() => { onProcess(call.recording_id); onClose(); }}
                className="shrink-0 h-9 px-4 text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                {call.status === "failed" ? "Retry" : "Analyze Now"}
              </button>
            )}
          </div>
        </div>

        {/* Body — 2-col */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left sidebar — metadata */}
          <div className="w-[220px] shrink-0 border-r border-border bg-muted/30 flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-5 space-y-5">

                {/* Processing states */}
                {!isDone && (
                  <div
                    className="rounded-xl p-3.5 border space-y-1.5"
                    style={
                      isProcessing
                        ? { borderColor: "oklch(0.56 0.23 275 / 0.3)", background: "oklch(0.56 0.23 275 / 0.06)" }
                        : call.status === "failed"
                        ? { borderColor: "oklch(0.56 0.21 20 / 0.3)", background: "oklch(0.56 0.21 20 / 0.06)" }
                        : { borderColor: "oklch(0.90 0.006 258)", background: "transparent" }
                    }
                  >
                    {isProcessing ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                          </span>
                          <p className="text-xs font-semibold text-primary">Analyzing</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground/60">Transcribing and analyzing...</p>
                      </>
                    ) : call.status === "failed" ? (
                      <>
                        <p className="text-xs font-semibold text-destructive">Failed</p>
                        <p className="text-[11px] text-muted-foreground/60">Processing encountered an error.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground/60">Pending</p>
                        <p className="text-[11px] text-muted-foreground/50">Not yet analyzed.</p>
                      </>
                    )}
                  </div>
                )}

                {call.agent_name && <MetaItem label="Agent">{call.agent_name}</MetaItem>}
                {call.callee_phone && (
                  <MetaItem label="Extension">
                    <span className="font-mono">{call.callee_phone}</span>
                  </MetaItem>
                )}
                {(call.customer_name || call.caller_phone) && (
                  <MetaItem label="Customer">
                    {call.customer_name ?? (
                      <span className="font-mono text-muted-foreground/60">{call.caller_phone}</span>
                    )}
                  </MetaItem>
                )}
                {call.caller_phone && (
                  <MetaItem label="Phone">
                    <span className="font-mono text-muted-foreground/70">{call.caller_phone}</span>
                  </MetaItem>
                )}
                {isDone && call.store && <MetaItem label="Store">{call.store}</MetaItem>}
                {isDone && call.category && (
                  <MetaItem label="Category">
                    <span className="capitalize">{call.category.replace(/_/g, " ")}</span>
                  </MetaItem>
                )}
                {isDone && call.order_type && (
                  <MetaItem label="Order Type">
                    <span className="capitalize">{call.order_type.replace(/_/g, " ")}</span>
                  </MetaItem>
                )}
                {isDone && call.order_total && <MetaItem label="Order Total">{call.order_total}</MetaItem>}
                {isDone && call.payment_method && (
                  <MetaItem label="Payment">
                    <span className="capitalize">{call.payment_method}</span>
                  </MetaItem>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right main content */}
          <ScrollArea className="flex-1">
            <div className="p-7 space-y-7">

              {/* Summary */}
              {isDone && call.summary && (
                <div>
                  <SectionLabel>Summary</SectionLabel>
                  <p className="text-[14px] leading-[1.75] text-foreground/85">{call.summary}</p>
                </div>
              )}

              {/* Key Points + Action Items side by side */}
              {isDone && (call.key_points?.length || call.action_items?.length) ? (
                <div className="grid grid-cols-2 gap-6">
                  {call.key_points && call.key_points.length > 0 && (
                    <div>
                      <SectionLabel>Key Points</SectionLabel>
                      <ul className="space-y-2.5">
                        {call.key_points.map((kp, i) => (
                          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            <span className="text-foreground/80">{kp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {call.action_items && call.action_items.length > 0 && (
                    <div>
                      <SectionLabel>Action Items</SectionLabel>
                      <ul className="space-y-2.5">
                        {call.action_items.map((ai, i) => (
                          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
                            <svg className="mt-0.5 shrink-0 text-primary/60" width="14" height="14" viewBox="0 0 14 14" fill="none">
                              <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.25"/>
                            </svg>
                            <span className="text-foreground/80">{ai}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Products */}
              {isDone && call.products && call.products.length > 0 && (
                <div>
                  <SectionLabel>Products Mentioned</SectionLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {call.products.map((p, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg bg-muted border border-border text-[12px] text-foreground/70"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Transcript */}
              {isDone && call.transcript && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <SectionLabel>Full Transcript</SectionLabel>
                    <button
                      onClick={handleCopy}
                      className="text-xs font-medium text-muted-foreground/50 hover:text-foreground/70 transition-colors px-2.5 py-1 rounded-lg border border-border hover:bg-muted"
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border bg-muted/50">
                      <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      <div className="w-2.5 h-2.5 rounded-full bg-border" />
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground/40">transcript.txt</span>
                    </div>
                    <div className="p-4 max-h-72 overflow-y-auto bg-card">
                      <pre className="text-[12px] font-mono text-foreground/70 leading-[1.85] whitespace-pre-wrap">
                        {call.transcript}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="h-2" />
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
