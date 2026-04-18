import { NextRequest, NextResponse } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

    // Recover zombie "processing" calls: anything stuck in processing for
    // longer than 5 minutes is definitely abandoned — reset to failed.
    await supabase
      .from("calls")
      .update({ status: "failed" })
      .eq("status", "processing")
      .lt("processing_started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString());

    const cx = new ThreeCXClient();
    await cx.login();
    const allRecordings = await cx.getRecordingsList();

    // Count existing IDs to know how many are new
    const { data: existing } = await supabase
      .from("calls")
      .select("recording_id");
    const existingIds = new Set((existing ?? []).map((r) => r.recording_id));
    const newCount = allRecordings.filter(
      (r) => !existingIds.has(r.recording_id)
    ).length;

    if (allRecordings.length > 0) {
      // Upsert metadata for ALL recordings from 3CX:
      // - New rows   → inserted with DB defaults (status='pending', products=[], etc.)
      // - Existing rows → ONLY these metadata columns updated; status / AI fields untouched
      const { error } = await supabase.from("calls").upsert(
        allRecordings.map((r) => ({
          recording_id: r.recording_id,
          start_time: r.start_time,
          caller_phone: r.caller_phone,
          callee_phone: r.callee_phone,
          agent_name: r.agent_name,
          duration_seconds: r.duration_seconds,
        })),
        { onConflict: "recording_id", ignoreDuplicates: false }
      );
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
    }

    return NextResponse.json({ new: newCount, total: allRecordings.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
