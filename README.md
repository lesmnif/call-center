# Kolas Call Intelligence Dashboard

Next.js dashboard for viewing, filtering, and syncing transcribed 3CX call recordings.

## Setup (one-time)

### 1. Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Open the **SQL Editor** and run the contents of `supabase-schema.sql`
3. Copy your project URL and keys from **Settings → API**

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in `.env.local`:

```

```

### 3. Import existing processed calls

If you already have calls processed in `../results.json`, import them:

```bash
npx tsx scripts/seed.ts
```

### 4. Run the dev server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

- The dashboard **auto-syncs on load** — it logs into 3CX, fetches the recordings list, and processes any new ones
- Use the **Sync Now** button to trigger an on-demand refresh
- A live progress bar shows download → transcribe → analyze steps per call
- Filter by store, agent, category, or sentiment
- Click any row to open the full detail panel with transcript, key points, action items

## File structure

```
src/
  app/
    page.tsx              — Main dashboard
    api/sync/route.ts     — Streaming SSE sync endpoint
  lib/
    three-cx-client.ts    — 3CX auth + protobuf + download
    protobuf.ts           — Binary protobuf decoder
    ai.ts                 — Whisper + GPT-5 mini
    supabase.ts           — DB client + types
    prompts.ts            — Whisper hint + system prompt
    hooks.ts              — useSync, useCalls hooks
  components/
    sync-bar.tsx          — Sync status + progress bar
    stats-row.tsx         — Summary stats cards
    filters.tsx           — Search + dropdown filters
    calls-table.tsx       — Sortable call list
    call-detail.tsx       — Slide-over detail panel
scripts/
  seed.ts                 — One-time import of results.json
supabase-schema.sql       — Run this in Supabase SQL Editor
```
