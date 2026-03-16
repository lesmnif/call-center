import { NextRequest } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";
import { transcribe, analyze } from "@/lib/ai";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 300;

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
      function send(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      const supabase = getSupabaseServer();

      try {
        // Fetch recording metadata from DB
        const { data: recording, error: fetchError } = await supabase
          .from("calls")
          .select("recording_id, start_time, caller_phone, callee_phone, agent_name")
          .eq("recording_id", recordingId)
          .single();

        if (fetchError || !recording) {
          send({ type: "fatal", message: `Recording ${recordingId} not found` });
          controller.close();
          return;
        }

        // Atomically claim this recording — only if still pending/failed
        const { data: claimed, error: claimError } = await supabase
          .from("calls")
          .update({ status: "processing", processing_started_at: new Date().toISOString() })
          .eq("recording_id", recordingId)
          .in("status", ["pending", "failed"])
          .select("recording_id");

        if (claimError || !claimed || claimed.length === 0) {
          send({ type: "done", processed: 0, failed: 0 });
          controller.close();
          return;
        }

        // Login to 3CX
        send({ type: "status", message: "Connecting to 3CX..." });
        const cx = new ThreeCXClient();
        await cx.login();

        // Download
        send({ type: "processing", recordingId, step: "downloading", current: 1, total: 1 });
        const wavBuffer = await cx.downloadRecording(recordingId);

        // Transcribe
        send({ type: "processing", recordingId, step: "transcribing", current: 1, total: 1 });
        const { text: transcript, estimatedMinutes } = await transcribe(wavBuffer, {
          onRetry: (attempt, _err, delayMs) => {
            send({
              type: "processing",
              recordingId,
              step: `transcribing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
              current: 1,
              total: 1,
            });
          },
        });

        // Analyze
        send({ type: "processing", recordingId, step: "analyzing", current: 1, total: 1 });
        const { analysis, inputTokens, outputTokens } = await analyze(transcript, {
          onRetry: (attempt, _err, delayMs) => {
            send({
              type: "processing",
              recordingId,
              step: `analyzing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
              current: 1,
              total: 1,
            });
          },
        });

        // Cost
        const whisperCost = estimatedMinutes * 0.006;
        const gptCost =
          (inputTokens / 1_000_000) * 0.25 + (outputTokens / 1_000_000) * 2.0;

        // Save
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
            processed_at: new Date().toISOString(),
          },
          { onConflict: "recording_id" }
        );

        if (error) throw new Error(`Supabase: ${error.message}`);

        send({
          type: "done",
          processed: 1,
          failed: 0,
          totalCost: Number((whisperCost + gptCost).toFixed(4)),
        });
      } catch (err) {
        await supabase
          .from("calls")
          .update({ status: "failed" })
          .eq("recording_id", recordingId)
          .then(() => {}, () => {});

        send({
          type: "fatal",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
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
