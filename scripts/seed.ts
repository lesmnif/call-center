/**
 * One-time seed script: imports existing results.json into Supabase.
 * Run with: npx tsx scripts/seed.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const resultsPath = resolve(__dirname, "../../results.json");
  console.log(`Reading ${resultsPath}...`);

  let raw: Record<string, Record<string, unknown>>;
  try {
    raw = JSON.parse(readFileSync(resultsPath, "utf-8"));
  } catch {
    console.error("Could not read results.json. Make sure it exists at:", resultsPath);
    process.exit(1);
  }

  const entries = Object.values(raw);
  console.log(`Found ${entries.length} records to import.`);

  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    const row = {
      recording_id: entry.recording_id as number,
      start_time: entry.start_time
        ? new Date(entry.start_time as string).toISOString()
        : null,
      caller_phone: (entry.caller_phone as string) ?? null,
      callee_phone: (entry.callee_phone as string) ?? null,
      transcript: (entry.transcript as string) ?? null,
      agent_name: (entry.agent_name as string) ?? null,
      customer_name: (entry.customer_name as string) ?? null,
      store: (entry.store as string) ?? null,
      category: (entry.category as string) ?? null,
      order_type: (entry.order_type as string) ?? null,
      products: (entry.products_mentioned as string[]) ?? [],
      order_total: (entry.order_total as string) ?? null,
      payment_method: (entry.payment_method as string) ?? null,
      summary: (entry.summary as string) ?? null,
      sentiment: (entry.sentiment as string) ?? null,
      outcome: (entry.outcome as string) ?? null,
      key_points: (entry.key_points as string[]) ?? [],
      action_items: (entry.action_items as string[]) ?? [],
      language: (entry.language as string) ?? null,
      processed_at: entry.processed_at
        ? new Date(entry.processed_at as string).toISOString()
        : new Date().toISOString(),
    };

    const { error } = await supabase
      .from("calls")
      .upsert(row, { onConflict: "recording_id" });

    if (error) {
      console.error(`  Failed recording ${row.recording_id}: ${error.message}`);
      skipped++;
    } else {
      imported++;
    }
  }

  console.log(`Done. ${imported} imported, ${skipped} skipped/failed.`);
}

main();
