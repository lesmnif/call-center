import { NextRequest, NextResponse } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";
import { getSupabaseServer } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(_req: NextRequest) {
  try {
    const supabase = getSupabaseServer();

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
        })),
        { onConflict: "recording_id" }
      );
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
    }

    return NextResponse.json({
      new: newCount,
      total: allRecordings.length,
      sample: allRecordings.slice(0, 3).map((r) => ({
        recording_id: r.recording_id,
        agent_name: r.agent_name,
        caller_phone: r.caller_phone,
        callee_phone: r.callee_phone,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
