# iApply Prime Institutions

Internal tool for iApply partner agents: prime institutions, their curated
programmes, commissions and bonuses, kept in step with the iApply Program
Explorer catalogue.

## What the app shows
- `/` — destination tabs, institution cards, programme popup
- `/program/<id>` — one shareable page per programme
- Every programme lists **all intakes the catalogue publishes, each with its
  status** (`Open`, `Open (Onshore Only)`, `Closed`). An intake in the current
  month or the next 3 months shows a pulsing **"Intake open now"** pill —
  **"Intake open now — best for onshore students"** when the catalogue marks it
  onshore-only. Smart filters **Immediate intakes** and **Onshore only** narrow
  the list; institution cards show "N programmes with immediate intake".

## Data flow
```
iApply Program Explorer (public, no login)
   university-list-data.php  -> header + first 3 cards
   program-data.php          -> remaining cards ("load more")
            │  paced 2.5 s (the portal firewall blocks bursts)
            ▼
   /api/sync  ── matches the CURATED programmes by portalId (fallback: name)
            │   writes catalogue fields only; never commission / bonus / target / best-for
            ▼
   Vercel Blob (free, Vercel-native: one private JSON blob)  ── read by the UI
   [or Neon Postgres via the Vercel Marketplace, also free]
            ▲
   /api/seed  ── master sheet (lib/prime-data.json) -> commission fields
```
Without storage connected the app reads `lib/prime-data.json` and **Sync now**
is a read-only preview that reports what would change.

**Storage modes** (`lib/store.js` picks one from the environment):
- `BLOB_READ_WRITE_TOKEN` → **Vercel Blob** — recommended. Free on Hobby
  (≈5 GB, 100 K reads, 10 K writes/month — this app uses a few hundred),
  hosted by Vercel itself, no other account. Dataset = one private JSON blob
  (`prime/dataset.json`) plus the last 50 sync runs.
- `DATABASE_URL` → Neon Postgres (Vercel Marketplace, free) — proper tables,
  if SQL reporting is ever wanted.
- neither → bundled JSON, read-only.
- `PRIME_STORE=blob|neon|json` forces a mode.

The number of programmes per institution is intentional (the curated list in
`lib/prime-data.json`). Sync refreshes those programmes; it never adds the rest
of the catalogue. A programme that disappears from the catalogue is kept and
flagged (`catalogue_missing_since`), never deleted.

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | for persistence | injected when a Blob store is connected (recommended) |
| `DATABASE_URL` | optional | injected by the Vercel ↔ Neon integration instead |
| `CRON_SECRET` | recommended | protects `GET /api/sync` (cron) and `POST /api/seed` |
| `PRIME_ACCESS_PASSWORD` | yes | password for the whole site |

## One-time setup on Vercel (free)
1. Project → **Storage** → **Create Database** → **Blob** → access **Private**
   → connect to this project. Vercel adds `BLOB_READ_WRITE_TOKEN` for you.
   (Neon Postgres works the same way if you prefer SQL: it adds `DATABASE_URL`.)
2. Project → **Settings → Environment Variables** → add `CRON_SECRET`
   (any long random string). Vercel sends it with every cron call.
3. Deploy (`vercel --prod`). First request creates the tables and seeds them
   from `lib/prime-data.json`. The cron in `vercel.json` then runs the full
   sync daily at 01:30 UTC (07:00 IST); **Sync now** runs it on demand.

## Updating commission / bonus (master sheet)
Edit `lib/prime-data.json`, deploy, then run
`APP_URL=https://<your-app> CRON_SECRET=<secret> npm run seed`
(or `POST /api/seed` with the bearer token). Only the locked fields change.

## Routes
- `POST /api/sync?inst=<id>` — sync one institution (the UI calls this per
  institution so the log streams); `POST /api/sync` — all 22
- `GET /api/sync` — same, for Vercel Cron (needs `Authorization: Bearer CRON_SECRET`)
- `POST /api/seed` — master sheet → database (bearer token)
- `GET /api/institutions` — current dataset as JSON

## Local development
```bash
npm install
PRIME_ACCESS_PASSWORD=testpass npm run dev        # JSON mode
DATABASE_URL=postgres://... npm run dev            # database mode
```
