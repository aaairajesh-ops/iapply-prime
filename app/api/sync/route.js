import { NextResponse } from 'next/server';
import data from '../../../lib/prime-data.json';

export const maxDuration = 60; // seconds (Vercel)

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Catalogue university ids, captured from the Program Explorer filter list.
const UNI = {
  nbcc: [1, 170], centennial: [1, 2], norquest: [1, 95], durham: [1, 106], humber: [1, 1],
  'alexander-burnaby': [1, 146], crandall: [1, 410], langara: [1, 188], sheridan: [1, 123],
  laurier: [1, 69], dalhousie: [1, 187], ucw: [1, 224], uottawa: [1, 460], capilano: [1, 162],
  'niagara-college': [1, 118], lethbridge: [1, 70],
  hertfordshire: [5, 716], 'uwe-bristol': [5, 729], brighton: [5, 1567],
  sunderland: [5, 1337], 'qmu-edinburgh': [5, 1602], bedfordshire: [5, 712],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchUniversity(cId, uId) {
  const res = await fetch('https://iapply.io/university-list-data.php?v=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Referer: 'https://iapply.io/program-explorer',
    },
    body: 'data_filters=' + encodeURIComponent(JSON.stringify({ c_id: String(cId), u_id: uId })),
    cache: 'no-store',
  });
  return res.ok ? res.text() : '';
}

// Minimal, dependency-free extraction of the fields we sync.
function parse(html) {
  const out = { logo: null, programs: [] };
  const logo = html.match(/logo-circle[\s\S]{0,200}?<img[^>]+src="([^"]+)"/i);
  if (logo) out.logo = logo[1];
  const cards = html.split('card-custom').slice(1);
  for (const c of cards) {
    const name = c.match(/card-title[^>]*>([^<]+)</);
    const level = c.match(/card-subtitle[^>]*>([^<]+)</);
    const fee = c.match(/((?:CAD|GBP|EUR|AUD)\s[\d,]+)/);
    const dur = c.match(/(\d+)\s*Months/);
    const tat = c.match(/(\d+)\s*days/);
    const pid = c.match(/programDetail\((\d+)\)/);
    if (name) {
      out.programs.push({
        portalId: pid ? Number(pid[1]) : null,
        name: name[1].trim(),
        level: level ? level[1].trim() : null,
        tuition: fee ? fee[1] : null,
        durationMonths: dur ? Number(dur[1]) : null,
        offerTatDays: tat ? Number(tat[1]) : null,
      });
    }
  }
  return out;
}

export async function POST() {
  const log = [];
  const results = {};
  let ok = 0, failed = 0;

  const entries = Object.entries(UNI);
  log.push(`Syncing ${entries.length} institutions from the iApply catalogue…`);

  for (const [id, [cId, uId]] of entries) {
    try {
      const html = await fetchUniversity(cId, uId);
      if (!html || html.length < 1500 || /403 Forbidden/i.test(html)) {
        failed++;
        log.push(`✗ ${id}: blocked or empty response (portal rate limit) — kept existing data`);
      } else {
        const parsed = parse(html);
        results[id] = parsed;
        ok++;
        log.push(`✓ ${id}: ${parsed.programs.length} programmes${parsed.logo ? ', logo found' : ''}`);
      }
    } catch (e) {
      failed++;
      log.push(`✗ ${id}: ${e.message}`);
    }
    await sleep(1200); // pace requests so the portal's WAF does not block us
  }

  log.push('');
  log.push(`Done — ${ok} synced, ${failed} skipped.`);
  log.push('Commission and bonus values were NOT touched (they come from the master sheet).');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log.push('Note: no database configured yet, so this run is read-only (preview of what would update).');
  }

  return NextResponse.json({
    ok: true,
    finishedAt: new Date().toISOString(),
    counts: { synced: ok, skipped: failed, institutions: entries.length },
    log,
    // returned so the UI can show a diff before anything is written
    results,
    unchangedFields: ['commission', 'commissionDetail', 'hasBonus', 'bonusShort'],
    baseline: data.generatedAt,
  });
}
