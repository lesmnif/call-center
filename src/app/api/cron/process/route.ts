import { NextRequest, NextResponse } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";
import { transcribe, analyze } from "@/lib/ai";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 300;

// Number of recordings to process per cron run.
// Keep low enough that the total fits within maxDuration.
const BATCH_SIZE = 2;

export async function GET(req: NextRequest) {
  // Vercel automatically sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServer();
  const cx = new ThreeCXClient();
  await cx.login();

  // Phase 1: Sync metadata from 3CX
  let synced = 0;
  try {
    const allRecordings = await cx.getRecordingsList();
    if (allRecordings.length > 0) {
      const { error: upsertErr } = await supabase.from("calls").upsert(
        allRecordings.map((r) => ({
          recording_id: r.recording_id,
          start_time: r.start_time,
          caller_phone: r.caller_phone,
          callee_phone: r.callee_phone,
          agent_name: r.agent_name,
        })),
        { onConflict: "recording_id", ignoreDuplicates: false }
      );
      if (!upsertErr) synced = allRecordings.length;
    }
  } catch {
    // Sync failure is non-fatal — continue to process existing pending
  }

  // Phase 2: Pick the oldest pending/failed recordings
  const { data: targets, error: fetchError } = await supabase
    .from("calls")
    .select("recording_id, start_time, caller_phone, callee_phone, agent_name")
    .in("status", ["pending", "failed"])
    .order("start_time", { ascending: true }) // oldest first
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    return NextResponse.json({ synced, processed: 0, failed: 0, message: "Nothing pending" });
  }

  let processed = 0;
  let failed = 0;

  for (const recording of targets) {
    const recId = recording.recording_id;

    try {
      // Atomically claim — skip if another process already picked it up
      const { data: claimed } = await supabase
        .from("calls")
        .update({ status: "processing" })
        .eq("recording_id", recId)
        .in("status", ["pending", "failed"])
        .select("recording_id");

      if (!claimed || claimed.length === 0) continue;

      const wavBuffer = await cx.downloadRecording(recId);
      const { text: transcript } = await transcribe(wavBuffer);
      const { analysis } = await analyze(transcript);

      await supabase.from("calls").upsert(
        {
          recording_id: recId,
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

      processed++;
    } catch {
      failed++;
      await supabase
        .from("calls")
        .update({ status: "failed" })
        .eq("recording_id", recId)
        .then(() => {}, () => {});
    }
  }

  return NextResponse.json({
    synced,
    processed,
    failed,
    total: targets.length,
  });
}
