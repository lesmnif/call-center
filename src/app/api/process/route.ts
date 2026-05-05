import { NextRequest } from "next/server";
import { getThreeCXClient } from "@/lib/three-cx-client";
import { transcribe, analyze, detectJunk } from "@/lib/ai";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 300;

const MAX_RETRIES = 2;

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const { recordingId } = (await req.json().catch(() => ({}))) as {
    recordingId?: number;
  };

  if (!recordingId) {
    return Response.json({ error: "recordingId required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(data: Record<string, unknown>) {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          closed = true;
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }

      const supabase = getSupabaseServer();

      try {
        // Fetch recording metadata from DB
        console.log(`[process] Starting recording ${recordingId}`);
        const { data: recording, error: fetchError } = await supabase
          .from("calls")
          .select("recording_id, start_time, caller_phone, callee_phone, agent_name, duration_seconds, retry_count")
          .eq("recording_id", recordingId)
          .single();

        if (fetchError || !recording) {
          console.log(`[process] Recording ${recordingId} not found:`, fetchError?.message);
          send({ type: "fatal", message: `Recording ${recordingId} not found` });
          return;
        }

        // Duration-based junk call filter — skip calls < 30s
        const duration = recording.duration_seconds;
        if (duration != null && duration < 30) {
          console.log(`[process] Skipped ${recordingId}: duration ${duration}s < 30s`);
          await supabase.from("calls").upsert(
            {
              recording_id: recordingId,
              status: "skipped",
              skip_reason: `Too short (${duration}s) — likely missed/voicemail`,
            },
            { onConflict: "recording_id" }
          );
          send({ type: "done", processed: 0, failed: 0 });
          return;
        }

        // Reset stale processing records (stuck > 5 min) so they can be reclaimed
        const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        await supabase
          .from("calls")
          .update({ status: "failed" })
          .eq("recording_id", recordingId)
          .eq("status", "processing")
          .lt("processing_started_at", staleThreshold);

        // Atomically claim this recording — only if pending or failed
        const { data: claimed, error: claimError } = await supabase
          .from("calls")
          .update({ status: "processing", processing_started_at: new Date().toISOString() })
          .eq("recording_id", recordingId)
          .in("status", ["pending", "failed"])
          .select("recording_id");

        if (claimError || !claimed || claimed.length === 0) {
          console.log(`[process] Recording ${recordingId} could not be claimed (already processing?):`, claimError?.message);
          send({ type: "done", processed: 0, failed: 0 });
          return;
        }
        console.log(`[process] Claimed recording ${recordingId}`);

        // Login to 3CX
        send({ type: "status", message: "Connecting to 3CX..." });
        const cx = getThreeCXClient();
        await cx.ensureLoggedIn();
        console.log(`[process] 3CX session ready`);

        // Download
        send({ type: "processing", recordingId, step: "downloading", current: 1, total: 1 });
        const wavBuffer = await cx.downloadRecording(recordingId);
        console.log(`[process] Downloaded ${recordingId}: ${(wavBuffer.byteLength / 1024).toFixed(0)} KB`);

        // Transcribe
        send({ type: "processing", recordingId, step: "transcribing", current: 1, total: 1 });
        const { text: transcript, estimatedMinutes } = await transcribe(wavBuffer, {
          onRetry: (attempt, _err, delayMs) => {
            console.log(`[process] Transcribe retry ${attempt} for ${recordingId}, waiting ${delayMs}ms`);
            send({
              type: "processing",
              recordingId,
              step: `transcribing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
              current: 1,
              total: 1,
            });
          },
        });
        console.log(`[process] Transcribed ${recordingId}: ${transcript.length} chars, ~${estimatedMinutes.toFixed(1)} min`);

        // Junk detection — cheap check before expensive analysis
        send({ type: "processing", recordingId, step: "checking", current: 1, total: 1 });
        const junkResult = await detectJunk(transcript);
        if (junkResult.is_junk) {
          const reason = junkResult.reason ?? "Junk call detected by AI";
          console.log(`[process] Skipped ${recordingId}: ${reason}`);
          await supabase.from("calls").upsert(
            {
              recording_id: recordingId,
              status: "skipped",
              skip_reason: reason,
              transcript,
            },
            { onConflict: "recording_id" }
          );
          send({ type: "done", processed: 0, failed: 0 });
          return;
        }

        // Analyze
        send({ type: "processing", recordingId, step: "analyzing", current: 1, total: 1 });
        const { analysis, inputTokens, outputTokens } = await analyze(transcript, {
          onRetry: (attempt, _err, delayMs) => {
            console.log(`[process] Analyze retry ${attempt} for ${recordingId}, waiting ${delayMs}ms`);
            send({
              type: "processing",
              recordingId,
              step: `analyzing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
              current: 1,
              total: 1,
            });
          },
        });
        console.log(`[process] Analyzed ${recordingId}: agent=${analysis.agent_name}, scores=${analysis.efficiency_score}/${analysis.communication_score}/${analysis.resolution_score}, tokens=${inputTokens}+${outputTokens}`);

        // Cost
        const whisperCost = estimatedMinutes * 0.006;
        const gptCost =
          (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 2.0;

        // Save
        console.log(`[process] Saving ${recordingId} to Supabase...`);
        const { error } = await supabase.from("calls").upsert(
          {
            recording_id: recordingId,
            status: "done",
            start_time: recording.start_time,
            caller_phone: recording.caller_phone,
            callee_phone: recording.callee_phone,
            transcript,
            agent_name: recording.agent_name ?? analysis.agent_name,
            customer_name: analysis.customer_name,
            store: analysis.store,
            category: analysis.category,
            order_type: analysis.order_type,
            products: analysis.products_mentioned,
            order_total: analysis.order_total,
            payment_method: analysis.payment_method,
            summary: analysis.summary,
            sentiment: analysis.sentiment,
            outcome: analysis.outcome,
            key_points: analysis.key_points,
            action_items: analysis.action_items,
            language: analysis.language,
            sale_completed: analysis.sale_completed,
            upsell_attempted: analysis.upsell_attempted,
            had_sales_opportunity: analysis.had_sales_opportunity,
            revenue: analysis.revenue,
            efficiency_score: analysis.efficiency_score,
            communication_score: analysis.communication_score,
            resolution_score: analysis.resolution_score,
            score_reasoning: analysis.score_reasoning,
            improvement_notes: analysis.improvement_notes,
            upsell_opportunities: analysis.upsell_opportunities,
            processed_at: new Date().toISOString(),
          },
          { onConflict: "recording_id" }
        );

        if (error) {
          console.error(`[process] Supabase upsert failed for ${recordingId}:`, error.message, error.details, error.hint);
          throw new Error(`Supabase: ${error.message}`);
        }
        console.log(`[process] Saved ${recordingId} OK, cost=$${(whisperCost + gptCost).toFixed(4)}`);

        send({
          type: "done",
          processed: 1,
          failed: 0,
          totalCost: Number((whisperCost + gptCost).toFixed(4)),
        });
      } catch (err) {
        console.error(`[process] FATAL for ${recordingId}:`, err instanceof Error ? err.message : String(err));

        // Fetch current retry count, increment, and mark permanently_failed if max exceeded
        const { data: current } = await supabase
          .from("calls")
          .select("retry_count")
          .eq("recording_id", recordingId)
          .single();
        const nextRetry = ((current?.retry_count as number) ?? 0) + 1;
        const newStatus = nextRetry >= MAX_RETRIES ? "permanently_failed" : "failed";

        if (newStatus === "permanently_failed") {
          console.log(`[process] Recording ${recordingId} permanently failed after ${nextRetry} attempts`);
        }

        await supabase
          .from("calls")
          .update({ status: newStatus, retry_count: nextRetry })
          .eq("recording_id", recordingId)
          .then(() => {}, () => {});

        send({
          type: "fatal",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
