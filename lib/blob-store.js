// Vercel Blob storage mode — Vercel-native, free on Hobby, nothing else to sign up for.
//
// The whole dataset (22 institutions, 365 programmes, ~320 KB) lives in ONE
// private JSON blob, plus the last 50 sync runs. A sync is a read-modify-write
// of that blob; the UI syncs institutions one after another, so writes never
// overlap. Vercel injects BLOB_READ_WRITE_TOKEN when you create a Blob store
// from the dashboard and connect it to the project.
//
// Locked (master-sheet) fields are only written by seedFromJson; the catalogue
// sync never touches them — same rule as the Postgres mode.

import { get, put } from '@vercel/blob';
import seedData from './prime-data.json';
import { normaliseProgramIntakes, sortIntakes } from './intakes';
import { diffInstitution, LOCKED_INSTITUTION_FIELDS, LOCKED_PROGRAMME_FIELDS } from './db';

// A connected Blob store sets BLOB_READ_WRITE_TOKEN (static token) or, in the
// newer OIDC mode, BLOB_STORE_ID (+ VERCEL_OIDC_TOKEN at runtime). Either works.
export const hasBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

const PATH = process.env.BLOB_DATASET_PATH || 'prime/dataset.json';
const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
const MAX_RUNS = 50;

async function readBlob() {
  const res = await get(PATH, { access: ACCESS, useCache: false });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  return JSON.parse(text);
}

async function writeBlob(dataset) {
  await put(PATH, JSON.stringify(dataset), {
    access: ACCESS,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
}

const fresh = () => ({
  ...seedData,
  source: 'blob',
  lastSyncedAt: null,
  syncRuns: [],
  destinations: seedData.destinations.map((d) => ({
    ...d,
    institutions: d.institutions.map((i) => ({ ...i, programs: i.programs.map(normaliseProgramIntakes) })),
  })),
});

let cached = null; // per-invocation memo so one request reads the blob once
async function load() {
  if (cached) return cached;
  let ds = await readBlob();
  if (!ds) {
    ds = fresh();
    await writeBlob(ds);
  }
  cached = ds;
  return ds;
}
async function save(ds) {
  cached = ds;
  await writeBlob(ds);
}
export const invalidate = () => { cached = null; };

/** Same shape as lib/prime-data.json, from the blob. */
export async function loadData() {
  invalidate();
  const ds = await load();
  return { ...ds, source: 'blob' };
}

const findInst = (ds, id) => ds.destinations.flatMap((d) => d.institutions).find((i) => i.id === id);

/** Write one institution's catalogue data. Never touches locked fields. */
export async function applyInstitution(instId, catalogue, { log = () => {} } = {}) {
  invalidate();
  const ds = await load();
  const inst = findInst(ds, instId);
  if (!inst) throw new Error(`unknown institution ${instId}`);
  const { patches, missing } = diffInstitution(inst.programs, catalogue.programs);
  const now = new Date().toISOString();
  let updated = 0, unchanged = 0;
  const byId = new Map(patches.map((p) => [p.id, p]));
  const missingIds = new Set(missing.map((m) => m.id));
  inst.programs = inst.programs.map((p) => {
    const patch = byId.get(p.id);
    const base = normaliseProgramIntakes(p);
    if (missingIds.has(p.id)) {
      log(`   ! ${p.name}: not found in the catalogue any more (kept, flagged)`);
      return { ...base, catalogueMissingSince: base.catalogueMissingSince || now };
    }
    if (!patch) return base;
    if (patch.changed.length === 0) { unchanged++; return { ...base, catalogueMissingSince: null, syncedAt: now }; }
    updated++;
    log(`   · ${p.name}: ${patch.changed.join(', ')}`);
    return { ...base, ...patch.after, intakeList: sortIntakes(patch.after.intakeList), catalogueMissingSince: null, syncedAt: now };
  });
  inst.portalLogo = catalogue.logo || inst.portalLogo || null;
  inst.syncedAt = now;
  await save(ds);
  return { updated, unchanged, missing: missing.length };
}

export async function recordRun(run) {
  const ds = await load();
  ds.syncRuns = [{ ...run, finishedAt: new Date().toISOString() }, ...(ds.syncRuns || [])].slice(0, MAX_RUNS);
  ds.lastSyncedAt = ds.syncRuns[0].finishedAt;
  await save(ds);
}

export async function lastRuns(n = 10) {
  const ds = await load();
  return (ds.syncRuns || []).slice(0, n).map(({ log, ...r }) => r);
}

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/**
 * Merge the master sheet (JSON) into the blob. Locked fields come from the
 * JSON when includeCommission=true; catalogue fields of existing programmes
 * are kept from the blob so a re-seed never rolls back a sync.
 */
export async function seedFromJson(data, { includeCommission = true } = {}) {
  invalidate();
  const ds = await load();
  let insts = 0, progs = 0;
  const lockedInst = LOCKED_INSTITUTION_FIELDS.map(camel);   // commission, commissionSource, commissionDetail, hasBonus, bonusShort, bestFor
  const lockedProg = LOCKED_PROGRAMME_FIELDS.map(camel);     // commission, commissionSource
  ds.destinations = data.destinations.map((jd) => {
    const cur = ds.destinations.find((d) => d.code === jd.code) || { institutions: [] };
    return {
      ...jd,
      institutions: jd.institutions.map((ji) => {
        insts++;
        const ci = cur.institutions.find((i) => i.id === ji.id);
        const inst = ci ? { ...ci } : { ...ji, programs: [] };
        // structural fields always follow the JSON
        for (const k of ['name', 'campus', 'city', 'type', 'logo', 'contact', 'progTags', 'portalCountryId', 'portalUniId', 'catalogueSource']) inst[k] = ji[k];
        if (!inst.portalLogo && ji.portalLogo) inst.portalLogo = ji.portalLogo;
        if (includeCommission || !ci) for (const k of lockedInst) inst[k] = ji[k];
        inst.programs = ji.programs.map((jp) => {
          progs++;
          const cp = ci?.programs.find((p) => p.id === jp.id);
          const prog = cp ? { ...cp } : normaliseProgramIntakes(jp);
          prog.ptype = jp.ptype;
          if (!prog.portalId && jp.portalId) prog.portalId = jp.portalId;
          if (includeCommission || !cp) for (const k of lockedProg) prog[k] = jp[k];
          return prog;
        });
        return inst;
      }),
    };
  });
  ds.features = data.features;
  ds.tags = data.tags;
  await save(ds);
  return { institutions: insts, programmes: progs };
}
