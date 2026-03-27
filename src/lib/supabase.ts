import { createClient } from "@supabase/supabase-js";

export type CallRecord = {
  id?: number;
  recording_id: number;
  status: 'pending' | 'processing' | 'done' | 'failed' | 'skipped' | 'permanently_failed';
  start_time: string | null;
  caller_phone: string | null;
  callee_phone: string | null;
  transcript: string | null;
  agent_name: string | null;
  customer_name: string | null;
  store: string | null;
  category: string | null;
  order_type: string | null;
  products: string[];
  order_total: string | null;
  payment_method: string | null;
  summary: string | null;
  sentiment: string | null;
  outcome: string | null;
  key_points: string[];
  action_items: string[];
  language: string | null;
  processed_at: string | null;
  duration_seconds: number | null;
  sale_completed: boolean | null;
  upsell_attempted: boolean | null;
  had_sales_opportunity: boolean | null;
  revenue: number | null;
  efficiency_score: number | null;
  communication_score: number | null;
  resolution_score: number | null;
  score_reasoning: string | null;
  improvement_notes: string | null;
  skip_reason: string | null;
  upsell_opportunities: string | null;
  retry_count: number;
  processing_started_at: string | null;
};

export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
