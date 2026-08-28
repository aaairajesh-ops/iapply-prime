# Claude Code prompt — iApply Prime Institutions app

Copy everything below the line into Claude Code, run from the root of the `iapply-prime-app` repo.

---

I'm working on the iApply Prime Institutions app (Next.js, deployed at https://iapply-prime-app.vercel.app). It shows a curated list of 22 partner institutions (16 Canada, 6 UK) with a fixed, hand-picked set of programmes per institution (19 for most, fewer for some — e.g. Crandall has 2, Alexander College and UCW have 4). Programme data is meant to come from the iApply agent portal Program Explorer (https://iapply.io/outreachs/search-program), while commission and bonus values come from our own master sheet and must never be overwritten by a sync.

Before you change anything, read the whole codebase first — especially the sync route (`/api/sync`), the programme/institution data model, the seed data, and the institution modal that lists programmes — and tell me what you found.

## What I already verified (current state)

1. Clicking "Sync now" runs `POST /api/sync`, loops over all 22 institutions and reports "✓ <slug>: 3 programmes, logo found", then prints: "Note: no database configured yet, so this run is read-only (preview of what would update)." So nothing is persisted today.
2. The sync fetches only 3 programmes per institution, but the cards show 19. The 19 are coming from the seed data, not from the sync.
3. The programme fields that ARE shown (name, level, duration, annual tuition, application fee, Express offer / Backlogs allowed / Scholarship / High ranked tags) match iApply exactly for the institutions I spot-checked (Crandall, Lethbridge, Hertfordshire).
4. Two gaps against iApply: (a) the app shows only ONE intake per programme (e.g. "Jan 2027") whereas iApply lists all of them (e.g. "Jan 2027, Jan 2026, Sep 2026"); (b) the "Low Tuition Fee" tag from iApply is not carried into the app (e.g. Crandall's Master of Management has it on iApply but not here).

## Task 1 — Show every intake, and highlight the immediate ones

Keep the curated programme list exactly as it is (do NOT expand to the full iApply catalogue; the number of programmes per institution is intentional). But for each programme:

- Store and display ALL intakes that iApply lists for it, not just the first one. Model intakes as a proper list of `{ month, year, status }` rather than a single string. iApply's "Program Intake Status" values are `Open` and `Open (Onshore Only)` — capture that status per intake.
- Sort intakes chronologically. Treat any intake whose month is the current month or later (today is late Aug 2026, so Aug 2026, Sep 2026, Oct 2026 … count) as "immediate / upcoming", and anything 6+ months out as "future".
- Add a prominent flash tag on each programme card when it has an immediate intake. Wording: **"Intake open now — best for onshore students"** when the immediate intake's status is `Open (Onshore Only)`, and **"Intake open now"** when it's plain `Open`. Style it distinctly from the existing tags (e.g. a small animated/pulsing pill in the same accent family as the BONUS badge) so agents can see it at a glance. Show the concrete intake month(s) inside the tag, e.g. "Sep 2026 · onshore".
- Add an **"Immediate intakes"** smart filter chip next to the existing ones (Scholarship available, Express offer, Low tuition fee, Backlogs allowed, Offer in 7 days or less, 2027 intake). When active, only programmes with an intake in the current or next 3 months are shown, and the institution cards' programme counts update accordingly. Also add an **"Onshore only"** chip that narrows further to `Open (Onshore Only)` intakes.
- On the institution card (grid view), show a small count like "3 programmes with immediate intake" when applicable, so agents can spot which institutions to pitch right now without opening the modal.
- Make sure the "Low Tuition Fee" tag from iApply is mapped into the app's `Low tuition fee` filter.

## Task 2 — Real, free database on Vercel + sync that mirrors the iApply agent portal

I want the sync to actually persist, using only what Vercel offers for free (no credit card, Hobby plan).

- Add a Postgres database through the **Vercel Marketplace → Neon** integration (free tier: 0.5 GB storage, plenty for ~22 institutions × ~20 programmes). If for any reason Neon isn't available, fall back to **Upstash Redis** (also free on the Vercel Marketplace) or **Turso**. Explain the trade-offs briefly before choosing. Use the connection string Vercel injects as an env var (`DATABASE_URL` / `POSTGRES_URL`); never hard-code credentials, and make local dev work with `vercel env pull`.
- Use Prisma or Drizzle (your choice, justify it) with tables for `institutions`, `programmes`, `intakes`, and `sync_runs` (timestamp, counts, per-institution log, errors). Keep `commission`, `bonus`, `target`, `free_border_pass` and the "best for" tagline in columns that the sync NEVER writes to — they only come from the master sheet / manual edits.
- Change `/api/sync` so that it: (1) pulls the iApply Program Explorer data for exactly the curated programmes per institution (match on institution slug + programme name; if a programme is no longer found on iApply, flag it in the sync log instead of deleting it); (2) updates name, level, duration, tuition, currency, application fee, offer TAT, PGWP/PSWV, all intakes with status, and all smart-filter tags (Express Offer, Backlogs Allowed, Scholarship Available, Low Tuition Fee, High Ranked, MOI Available, English Language Proficiency Waiver, Gap Allowed); (3) writes a `sync_runs` row; (4) returns the same per-institution streaming log the UI shows today, but with real "updated / unchanged / not found" counts instead of the read-only note.
- Remove the "3 programmes" limit in the fetcher so it syncs the full curated list for each institution.
- Add a Vercel Cron (free on Hobby, once per day is fine) that calls the sync automatically, plus keep the manual "Sync now" button.
- Add a small seed script that loads the current seed data into the new database once, so the app is never empty on first deploy.
- The UI should read from the database (server components or a `/api/institutions` route with short revalidation), not from the static seed file, once the DB is present. Keep a graceful fallback to seed data if `DATABASE_URL` is missing so the preview deployments still work.

## Working style

- Make changes in small commits with clear messages.
- Before touching the sync, write down which iApply fields map to which columns and show me the mapping.
- After implementing, run the sync locally against the real iApply source, then show me a before/after diff for 2 institutions (Crandall and Hertfordshire) proving intakes and tags now match iApply, and that commission/bonus were untouched.
- Tell me every env var and Vercel dashboard step I need to do myself (adding the Neon integration, setting the cron secret, etc.) — don't assume I've done them.
- If anything in the iApply portal needs a login/session to read, stop and tell me what you need rather than guessing.
