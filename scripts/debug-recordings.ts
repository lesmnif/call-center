/**
 * Verify updated parser extracts names/phones correctly.
 * Run with: npx tsx --env-file=.env.local scripts/debug-recordings.ts
 */

import { ThreeCXClient } from "../src/lib/three-cx-client";

async function main() {
  const cx = new ThreeCXClient();
  await cx.login();
  const recordings = await cx.getRecordingsList();

  console.log(`\nFetched ${recordings.length} recordings\n`);
  for (const r of recordings.slice(0, 10)) {
    console.log(
      `ID=${r.recording_id}  start=${r.start_time?.slice(0,19)}  ` +
      `agent="${r.agent_name ?? "—"}"  caller=${r.caller_phone ?? "—"}  callee=${r.callee_phone ?? "—"}`
    );
  }
}

main().catch(console.error);
