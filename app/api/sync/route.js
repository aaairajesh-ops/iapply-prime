import { NextResponse } from 'next/server';
import { UNI, fetchInstitution } from '../../../lib/catalogue';
import { isPersistent, storeKind, loadData, applyInstitution, diffInstitution, recordRun } from '../../../lib/store';

// Vercel Hobby allows up to 300 s per invocation with Fluid compute; a full
// 22-institution run at 2.5 s pacing takes ~2.5 min. Single-institution calls
// (what the UI uses) finish in a few seconds.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const PACE_MS = 2500; // the portal's firewall blocks bursts faster than ~2 s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authorised(req) {
  // Cron / external callers must present CRON_SECRET; the in-app button is a
  // same-origin POST and is allowed as before.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (secret && auth === `Bearer ${secret}`) return true;
  if (req.method === 'POST' && !req.headers.get('authorization')) {
    const origin = req.headers.get('origin') || '';
    const host = req.headers.get('host') || '';
    return !origin || origin.endsWith(host);
  }
  return !secret; // no secret configured -> open (dev)
}

async function runSync({ instIds, trigger }) {
  const startedAt = new Date().toISOString();
  const log = [];
  const say = (s) => log.push(s);
  const data = await loadData();
  const allInsts = data.destinations.flatMap((d) => d.institutions);
  const targets = allInsts.filter((i) => instIds.includes(i.id));
  const totals = { institutions: targets.length, updated: 0, unchanged: 0, missing: 0, errors: 0 };
  const preview = {};

  say(`Syncing ${targets.length} institution${targets.length === 1 ? '' : 's'} from the iApply catalogue…`);

  for (let n = 0; n < targets.length; n++) {
    const inst = targets[n];
    const ids = UNI[inst.id] || (inst.portalUniId ? [inst.portalCountryId, inst.portalUniId] : null);
    if (!ids) { say(`✗ ${inst.id}: no catalogue id`); totals.errors++; continue; }
    try {
      const portal = ids[2] === 'portal' || inst.catalogueSource === 'portal';
      const catalogue = await fetchInstitution(ids[0], ids[1], { pace: PACE_MS, portal });
      let r;
      if (isPersistent()) {
        r = await applyInstitution(inst.id, catalogue, { log: say });
      } else {
        const { patches, missing } = diffInstitution(inst.programs, catalogue.programs);
        r = { updated: patches.filter((p) => p.changed.length).length, unchanged: patches.filter((p) => !p.changed.length).length, missing: missing.length };
        preview[inst.id] = { patches: patches.filter((p) => p.changed.length), missing: missing.map((m) => m.name) };
        for (const p of patches.filter((x) => x.changed.length)) say(`   · ${p.name}: ${p.changed.join(', ')}`);
        for (const m of missing) say(`   ! ${m.name}: not found in the catalogue any more (kept, flagged)`);
      }
      totals.updated += r.updated; totals.unchanged += r.unchanged; totals.missing += r.missing;
      say(`✓ ${inst.id}${catalogue.source === 'portal' ? ' (agent portal)' : ''}: catalogue lists ${catalogue.total ?? catalogue.programs.length}, curated ${inst.programs.length} → ${r.updated} updated, ${r.unchanged} unchanged${r.missing ? `, ${r.missing} missing` : ''}`);
    } catch (e) {
      totals.errors++;
      say(`${e.auth ? '⚠' : '✗'} ${inst.id}: ${e.message} — kept existing data`);
      if (e.blocked) await sleep(10000); // back off before the next institution
    }
    if (n < targets.length - 1) await sleep(PACE_MS);
  }

  say('');
  say(`Done — ${totals.updated} programmes updated, ${totals.unchanged} unchanged, ${totals.missing} flagged missing, ${totals.errors} institution errors.`);
  say('Commission, bonus, target and "best for" were NOT touched (they come from the master sheet).');
  if (!isPersistent()) say('Note: no storage connected (BLOB_READ_WRITE_TOKEN / DATABASE_URL), so this run is a read-only preview — create a Blob store in Vercel to persist.');
  else await recordRun({ startedAt, trigger, ...totals, log });

  return { ok: true, startedAt, finishedAt: new Date().toISOString(), persisted: isPersistent(), store: storeKind(), counts: totals, log, preview,
    unchangedFields: ['commission', 'commissionDetail', 'hasBonus', 'bonusShort', 'bestFor'] };
}

function pickTargets(req) {
  const url = new URL(req.url);
  const inst = url.searchParams.get('inst');
  return inst ? inst.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(UNI);
}

export async function POST(req) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  const out = await runSync({ instIds: pickTargets(req), trigger: 'manual' });
  return NextResponse.json(out);
}

// Vercel Cron calls GET with `Authorization: Bearer $CRON_SECRET`.
export async function GET(req) {
  if (!authorised(req)) return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  const out = await runSync({ instIds: pickTargets(req), trigger: 'cron' });
  return NextResponse.json(out);
}
