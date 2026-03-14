import { NextResponse } from "next/server";
import { ThreeCXClient } from "@/lib/three-cx-client";

export const maxDuration = 30;

export async function GET() {
  const cx = new ThreeCXClient();
  await cx.login();
  const recordings = await cx.getRecordingsList();
  return NextResponse.json(recordings.slice(0, 5));
}
