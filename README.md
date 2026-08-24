# iApply Prime Institutions

Internal tool for iApply partner agents: prime institutions, their programmes,
commissions and bonuses, with a manual sync from the iApply Program Explorer.

## Why this exists as a separate app
The original page was PHP, which Vercel does not run. This is the same product
rebuilt in Next.js so it can be hosted on Vercel with Supabase behind it.

## Security
The whole site sits behind HTTP Basic auth (`PRIME_ACCESS_PASSWORD`) because it
shows commission and bonus figures. If that variable is missing the app returns
503 and serves nothing — it fails closed, never open.

## Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `PRIME_ACCESS_PASSWORD` | yes | password for the whole site |
| `NEXT_PUBLIC_SUPABASE_URL` | later | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | later | server-side writes during sync |

## Routes
- `/` — destination tabs, institution cards, programme popup
- `/program/<id>` — one page per programme; opens in a new tab, so every
  programme has its own shareable URL (this is what solves the unique-id issue)
- `/api/sync` — POST; pulls fresh catalogue data from iApply, paced to avoid the
  portal's rate limiting. **Never touches commission or bonus fields.**

## Data
`lib/prime-data.json` holds the current dataset (7 destinations, 24
institutions, 82 programmes). Commission and bonus values come from the master
product sheet and are maintained by hand; everything else can be refreshed with
the Sync now button.

## Local development
```bash
npm install
PRIME_ACCESS_PASSWORD=testpass npm run dev
```
