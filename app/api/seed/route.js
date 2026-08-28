import { NextResponse } from 'next/server';
import seedData from '../../../lib/prime-data.json';
import { isPersistent, prepare, seedFromJson, storeKind } from '../../../lib/store';

// Push the master sheet (lib/prime-data.json) into the database.
// This is the ONLY code path that writes commission / bonus / target fields.
//   POST /api/seed            -> Authorization: Bearer $CRON_SECRET
// Catalogue fields of existing programmes are left alone (the sync owns them).
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req) {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  if (!isPersistent()) return NextResponse.json({ ok: false, error: 'no storage connected (BLOB_READ_WRITE_TOKEN or DATABASE_URL)' }, { status: 400 });
  await prepare();
  const r = await seedFromJson(seedData, { includeCommission: true });
  return NextResponse.json({ ok: true, store: storeKind(), ...r, note: 'Commission/bonus fields refreshed from the master sheet; catalogue fields untouched.' });
}
