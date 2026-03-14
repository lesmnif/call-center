import { NextRequest } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";
import { transcribe, analyze } from "@/lib/ai";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 300;

const INTER_RECORDING_DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const { recordingIds } = (await req.json().catch(() => ({}))) as {
    recordingIds?: number[];
  };

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const supabase = getSupabaseServer();

        // Fetch target recordings from DB
        let query = supabase
          .from("calls")
          .select("id, recording_id, start_time, caller_phone, callee_phone, status");

        if (recordingIds && recordingIds.length > 0) {
          query = query.in("recording_id", recordingIds);
        } else {
          query = query.in("status", ["pending", "failed"]);
        }

        const { data: targets, error: fetchError } = await query;
        if (fetchError) throw new Error(`Fetch: ${fetchError.message}`);

        const toProcess = targets ?? [];

        send({
          type: "progress",
          total: toProcess.length,
          toProcess: toProcess.length,
        });

        if (toProcess.length === 0) {
          send({ type: "done", processed: 0, failed: 0 });
          controller.close();
          return;
        }

        // Login to 3CX once
        send({ type: "status", message: "Logging in to 3CX..." });
        const cx = new ThreeCXClient();
        await cx.login();
        send({ type: "status", message: "Authenticated" });

        let processed = 0;
        let failed = 0;
        let totalCost = 0;

        for (let i = 0; i < toProcess.length; i++) {
          const recording = toProcess[i];
          const recId = recording.recording_id;

          if (i > 0) {
            await sleep(INTER_RECORDING_DELAY_MS);
          }

          // Mark as processing
          await supabase
            .from("calls")
            .update({ status: "processing" })
            .eq("recording_id", recId);

          try {
            send({
              type: "processing",
              recordingId: recId,
              step: "downloading",
              current: processed + failed + 1,
              total: toProcess.length,
            });

            const wavBuffer = await cx.downloadRecording(recId);

            send({
              type: "processing",
              recordingId: recId,
              step: "transcribing",
              current: processed + failed + 1,
              total: toProcess.length,
            });

            const { text: transcript, estimatedMinutes } =
              await transcribe(wavBuffer, {
                onRetry: (attempt, _error, delayMs) => {
                  send({
                    type: "processing",
                    recordingId: recId,
                    step: `transcribing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
                    current: processed + failed + 1,
                    total: toProcess.length,
                  });
                },
              });

            send({
              type: "processing",
              recordingId: recId,
              step: "analyzing",
              current: processed + failed + 1,
              total: toProcess.length,
            });

            const { analysis, inputTokens, outputTokens } =
              await analyze(transcript, {
                onRetry: (attempt, _error, delayMs) => {
                  send({
                    type: "processing",
                    recordingId: recId,
                    step: `analyzing (retry ${attempt}, waiting ${(delayMs / 1000).toFixed(0)}s)`,
                    current: processed + failed + 1,
                    total: toProcess.length,
                  });
                },
              });

            const whisperCost = estimatedMinutes * 0.006;
            const gptCost =
              (inputTokens / 1_000_000) * 0.25 +
              (outputTokens / 1_000_000) * 2.0;
            totalCost += whisperCost + gptCost;

            const { error } = await supabase.from("calls").upsert(
              {
                recording_id: recId,
                status: "done",
                start_time: recording.start_time,
                caller_phone: recording.caller_phone,
                callee_phone: recording.callee_phone,
                transcript,
                agent_name: analysis.agent_name,
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

            if (error) throw new Error(`Supabase update: ${error.message}`);

            processed++;
            send({
              type: "processed",
              recordingId: recId,
              category: analysis.category,
              sentiment: analysis.sentiment,
              agentName: analysis.agent_name,
              store: analysis.store,
              current: processed + failed,
              total: toProcess.length,
            });
          } catch (err) {
            failed++;
            await supabase
              .from("calls")
              .update({ status: "failed" })
              .eq("recording_id", recId);

            send({
              type: "error",
              recordingId: recId,
              message: err instanceof Error ? err.message : String(err),
              current: processed + failed,
              total: toProcess.length,
            });
          }
        }

        send({
          type: "done",
          processed,
          failed,
          totalCost: Number(totalCost.toFixed(4)),
        });
      } catch (err) {
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
