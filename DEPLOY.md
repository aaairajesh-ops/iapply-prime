# Deploy checklist — iApply Prime Institutions

1. **Storage (free, Vercel-only)** — Vercel → project `iapply-prime-app` →
   Storage → Create Database → **Blob** → access: **Private** → connect to
   this project. Vercel adds `BLOB_READ_WRITE_TOKEN` automatically.
   (Optional instead: Neon Postgres from the same menu → adds `DATABASE_URL`.)
2. **Cron secret** — Settings → Environment Variables → `CRON_SECRET` =
   any long random string (used by the daily sync and `/api/seed`).
3. **Deploy** — in this folder:
   ```
   npm install
   vercel --prod
   ```
4. Open the site once: the first request writes `prime/dataset.json` into the
   Blob store from `lib/prime-data.json`. Click **Sync now** to pull the
   catalogue — the status line should read "saved to Vercel Blob" instead of
   "preview only".
5. The cron in `vercel.json` then runs the full sync every day at 07:00 IST.

Commission / bonus changes: edit `lib/prime-data.json`, deploy, then run
`APP_URL=https://iapply-prime-app.vercel.app CRON_SECRET=<secret> npm run seed`.
