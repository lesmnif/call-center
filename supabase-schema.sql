-- Run this in your Supabase SQL Editor to create the calls table

create table if not exists calls (
  id              serial primary key,
  recording_id    integer unique not null,
  start_time      timestamptz,
  caller_phone    text,
  callee_phone    text,
  transcript      text,
  agent_name      text,
  customer_name   text,
  store           text,
  category        text,
  order_type      text,
  products        jsonb default '[]'::jsonb,
  order_total     text,
  payment_method  text,
  summary         text,
  sentiment       text,
  outcome         text,
  key_points      jsonb default '[]'::jsonb,
  action_items    jsonb default '[]'::jsonb,
  language        text,
  processed_at    timestamptz default now(),
  duration_seconds    integer,
  sale_completed      boolean,
  upsell_attempted    boolean,
  had_sales_opportunity boolean,
  revenue             numeric(10,2),
  efficiency_score    smallint,
  communication_score smallint,
  resolution_score    smallint,
  score_reasoning     text,
  improvement_notes   text,
  status              text default 'pending',
  skip_reason         text,
  upsell_opportunities text
);

create index if not exists idx_calls_recording_id on calls(recording_id);
create index if not exists idx_calls_start_time on calls(start_time desc);
create index if not exists idx_calls_store on calls(store);
create index if not exists idx_calls_agent on calls(agent_name);
create index if not exists idx_calls_category on calls(category);
create index if not exists idx_calls_sentiment on calls(sentiment);

-- RLS: allow reads from anon key, writes only from service role
alter table calls enable row level security;

create policy "Allow public read" on calls
  for select using (true);

create policy "Allow service role insert" on calls
  for insert with check (true);

create policy "Allow service role update" on calls
  for update using (true);
