// Neon Postgres (free tier via the Vercel Marketplace) behind a tiny data layer.
//
// - No DATABASE_URL  -> the app reads lib/prime-data.json exactly as before and
//                       "Sync now" only previews what would change.
// - DATABASE_URL set -> tables are created on first use, seeded once from the
//                       JSON, and the UI reads from the database from then on.
//
// Commission / bonus / target / border-pass / "best for" columns are written
// ONLY by seed (the master sheet). The catalogue sync never touches them.

import { neon } from '@neondatabase/serverless';
import seedData from './prime-data.json';
import { mergeIntakes, listToString, normaliseProgramIntakes, sortIntakes } from './intakes';

export const hasDb = () => Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

let _sql = null;
export function sql() {
  if (!hasDb()) throw new Error('DATABASE_URL is not set');
  if (!_sql) _sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  return _sql;
}

// Fields the master sheet owns. The sync must never write these.
export const LOCKED_INSTITUTION_FIELDS = ['commission', 'commission_source', 'commission_detail', 'has_bonus', 'bonus_short', 'best_for'];
export const LOCKED_PROGRAMME_FIELDS = ['commission', 'commission_source'];

let schemaReady = false;
export async function ensureSchema() {
  if (schemaReady) return;
  const q = sql();
  await q`CREATE TABLE IF NOT EXISTS institutions (
    id text PRIMARY KEY,
    dest_code text NOT NULL,
    sort int NOT NULL DEFAULT 0,
    name text NOT NULL,
    campus text, city text, type text, best_for text, logo text, contact text,
    commission text, commission_source text, commission_detail jsonb,
    has_bonus boolean NOT NULL DEFAULT false, bonus_short text,
    prog_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    portal_country_id int, portal_uni_id int, portal_logo text,
    synced_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE TABLE IF NOT EXISTS programmes (
    id text PRIMARY KEY,
    inst_id text NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    sort int NOT NULL DEFAULT 0,
    portal_id int,
    name text NOT NULL, ptype text, level text, duration text,
    intakes text, intake_list jsonb NOT NULL DEFAULT '[]'::jsonb,
    tf int, tuition text, application_fee text, offer_tat text,
    features jsonb NOT NULL DEFAULT '[]'::jsonb, tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    card_status text,
    commission text, commission_source text,
    catalogue_missing_since timestamptz,
    synced_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await q`CREATE INDEX IF NOT EXISTS programmes_inst_idx ON programmes(inst_id, sort)`;
  await q`CREATE TABLE IF NOT EXISTS sync_runs (
    id serial PRIMARY KEY,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    trigger text,
    institutions int DEFAULT 0, updated int DEFAULT 0, unchanged int DEFAULT 0,
    missing int DEFAULT 0, errors int DEFAULT 0,
    log jsonb NOT NULL DEFAULT '[]'::jsonb
  )`;
  const [{ n }] = await q`SELECT count(*)::int AS n FROM institutions`;
  if (n === 0) await seedFromJson(seedData, { includeCommission: true });
  schemaReady = true;
}

/**
 * Upsert institutions + programmes from the JSON file.
 * includeCommission=true also writes the master-sheet fields (seed / sheet update).
 * Catalogue fields are only written when the row is new, so a re-seed never
 * rolls back what the sync has refreshed.
 */
export async function seedFromJson(data, { includeCommission = true } = {}) {
  const q = sql();
  let insts = 0, progs = 0;
  for (const dest of data.destinations) {
    let isort = 0;
    for (const inst of dest.institutions) {
      isort++;
      await q`INSERT INTO institutions (id, dest_code, sort, name, campus, city, type, best_for, logo, contact,
          commission, commission_source, commission_detail, has_bonus, bonus_short, prog_tags, portal_country_id, portal_uni_id)
        VALUES (${inst.id}, ${dest.code}, ${isort}, ${inst.name}, ${inst.campus || null}, ${inst.city || null}, ${inst.type || null},
          ${inst.bestFor || null}, ${inst.logo || null}, ${inst.contact || null},
          ${inst.commission || null}, ${inst.commissionSource || null}, ${JSON.stringify(inst.commissionDetail || null)}::jsonb,
          ${Boolean(inst.hasBonus)}, ${inst.bonusShort || null}, ${JSON.stringify(inst.progTags || [])}::jsonb,
          ${inst.portalCountryId || null}, ${inst.portalUniId || null})
        ON CONFLICT (id) DO UPDATE SET
          dest_code = EXCLUDED.dest_code, sort = EXCLUDED.sort, name = EXCLUDED.name,
          campus = EXCLUDED.campus, city = EXCLUDED.city, type = EXCLUDED.type, logo = EXCLUDED.logo,
          contact = EXCLUDED.contact, prog_tags = EXCLUDED.prog_tags,
          portal_country_id = EXCLUDED.portal_country_id, portal_uni_id = EXCLUDED.portal_uni_id,
          best_for = CASE WHEN ${includeCommission} THEN EXCLUDED.best_for ELSE institutions.best_for END,
          commission = CASE WHEN ${includeCommission} THEN EXCLUDED.commission ELSE institutions.commission END,
          commission_source = CASE WHEN ${includeCommission} THEN EXCLUDED.commission_source ELSE institutions.commission_source END,
          commission_detail = CASE WHEN ${includeCommission} THEN EXCLUDED.commission_detail ELSE institutions.commission_detail END,
          has_bonus = CASE WHEN ${includeCommission} THEN EXCLUDED.has_bonus ELSE institutions.has_bonus END,
          bonus_short = CASE WHEN ${includeCommission} THEN EXCLUDED.bonus_short ELSE institutions.bonus_short END,
          updated_at = now()`;
      insts++;
      let psort = 0;
      for (const raw of inst.programs) {
        psort++;
        const p = normaliseProgramIntakes(raw);
        await q`INSERT INTO programmes (id, inst_id, sort, portal_id, name, ptype, level, duration, intakes, intake_list,
            tf, tuition, application_fee, offer_tat, features, tags, card_status, commission, commission_source)
          VALUES (${p.id}, ${inst.id}, ${psort}, ${p.portalId || null}, ${p.name}, ${p.ptype || null}, ${p.level || null},
            ${p.duration || null}, ${p.intakes || null}, ${JSON.stringify(p.intakeList)}::jsonb,
            ${typeof p.tf === 'number' ? p.tf : null}, ${p.tuition || null}, ${p.applicationFee || null}, ${p.offerTat || null},
            ${JSON.stringify(p.features || [])}::jsonb, ${JSON.stringify(p.tags || [])}::jsonb, ${p.cardStatus || null},
            ${p.commission || null}, ${p.commissionSource || null})
          ON CONFLICT (id) DO UPDATE SET
            inst_id = EXCLUDED.inst_id, sort = EXCLUDED.sort, ptype = EXCLUDED.ptype,
            portal_id = COALESCE(programmes.portal_id, EXCLUDED.portal_id),
            commission = CASE WHEN ${includeCommission} THEN EXCLUDED.commission ELSE programmes.commission END,
            commission_source = CASE WHEN ${includeCommission} THEN EXCLUDED.commission_source ELSE programmes.commission_source END,
            updated_at = now()`;
        progs++;
      }
    }
  }
  return { institutions: insts, programmes: progs };
}

const rowToInst = (r) => ({
  id: r.id, name: r.name, campus: r.campus, city: r.city, type: r.type, bestFor: r.best_for, logo: r.logo,
  contact: r.contact, commission: r.commission, commissionSource: r.commission_source,
  commissionDetail: r.commission_detail, hasBonus: r.has_bonus, bonusShort: r.bonus_short,
  progTags: r.prog_tags || [], portalCountryId: r.portal_country_id, portalUniId: r.portal_uni_id,
  syncedAt: r.synced_at, programs: [],
});

const rowToProg = (r) => ({
  id: r.id, portalId: r.portal_id, name: r.name, ptype: r.ptype, level: r.level, duration: r.duration,
  intakes: r.intakes, intakeList: r.intake_list || [], tf: r.tf, tuition: r.tuition,
  applicationFee: r.application_fee, offerTat: r.offer_tat, features: r.features || [], tags: r.tags || [],
  cardStatus: r.card_status, commission: r.commission, commissionSource: r.commission_source,
  catalogueMissingSince: r.catalogue_missing_since, syncedAt: r.synced_at,
});

/** Same shape as lib/prime-data.json, sourced from the database. */
export async function loadData() {
  if (!hasDb()) return localData();
  await ensureSchema();
  const q = sql();
  const insts = await q`SELECT * FROM institutions ORDER BY dest_code, sort`;
  const progs = await q`SELECT * FROM programmes ORDER BY inst_id, sort`;
  const byInst = new Map(insts.map((r) => [r.id, rowToInst(r)]));
  for (const r of progs) byInst.get(r.inst_id)?.programs.push(rowToProg(r));
  const [{ last }] = await q`SELECT max(finished_at) AS last FROM sync_runs`;
  return {
    ...seedData,
    source: 'database',
    lastSyncedAt: last,
    destinations: seedData.destinations.map((d) => ({
      ...d,
      institutions: insts.filter((r) => r.dest_code === d.code).map((r) => byInst.get(r.id)),
    })),
  };
}

/** JSON fallback, normalised so every programme carries intakeList. */
export function localData() {
  return {
    ...seedData,
    source: 'json',
    lastSyncedAt: null,
    destinations: seedData.destinations.map((d) => ({
      ...d,
      institutions: d.institutions.map((i) => ({ ...i, programs: i.programs.map(normaliseProgramIntakes) })),
    })),
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Work out what the catalogue changes for one institution, WITHOUT writing.
 * Returns per-programme patches so the same logic serves the preview (no DB)
 * and the real write (DB).
 */
export function diffInstitution(existingPrograms, cataloguePrograms) {
  const byPortal = new Map(cataloguePrograms.filter((c) => c.portalId).map((c) => [c.portalId, c]));
  const byName = new Map(cataloguePrograms.map((c) => [norm(c.name), c]));
  const patches = [];
  const missing = [];
  for (const p of existingPrograms) {
    const c = (p.portalId && byPortal.get(p.portalId)) || byName.get(norm(p.name));
    if (!c) { missing.push(p); continue; }
    const before = normaliseProgramIntakes(p);
    const intakeList = mergeIntakes(before.intakeList, c.intakeList);
    const after = {
      portalId: c.portalId || p.portalId || null,
      name: c.name || p.name,
      level: c.level || p.level || null,
      duration: c.duration || p.duration || null,
      intakeList,
      intakes: listToString(intakeList),
      tf: c.tf ?? p.tf ?? null,
      tuition: c.tuition || p.tuition || null,
      applicationFee: c.applicationFee || p.applicationFee || null,
      offerTat: c.offerTat || p.offerTat || null,
      features: sortFeatures(c.features),
      cardStatus: c.cardStatus || null,
    };
    const changed = [];
    const same = (x, y) => {
      if (typeof x === 'string' && typeof y === 'string') return x.replace(/\s+/g, ' ').trim() === y.replace(/\s+/g, ' ').trim();
      return JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
    };
    for (const k of Object.keys(after)) {
      const prev = k === 'features' ? sortFeatures(p.features) : before[k];
      if (!same(after[k], prev)) changed.push(k);
    }
    patches.push({ id: p.id, name: p.name, changed, after });
  }
  return { patches, missing };
}

const sortFeatures = (f) => [...new Set(f || [])].sort();

/** Write one institution's catalogue data. Never touches locked fields. */
export async function applyInstitution(instId, catalogue, { log = () => {} } = {}) {
  await ensureSchema();
  const q = sql();
  const rows = await q`SELECT * FROM programmes WHERE inst_id = ${instId} ORDER BY sort`;
  const { patches, missing } = diffInstitution(rows.map(rowToProg), catalogue.programs);
  let updated = 0, unchanged = 0;
  for (const p of patches) {
    const a = p.after;
    if (p.changed.length === 0) {
      unchanged++;
      await q`UPDATE programmes SET synced_at = now(), catalogue_missing_since = NULL WHERE id = ${p.id}`;
      continue;
    }
    updated++;
    await q`UPDATE programmes SET
        portal_id = ${a.portalId}, name = ${a.name}, level = ${a.level}, duration = ${a.duration},
        intakes = ${a.intakes}, intake_list = ${JSON.stringify(sortIntakes(a.intakeList))}::jsonb,
        tf = ${a.tf}, tuition = ${a.tuition}, application_fee = ${a.applicationFee}, offer_tat = ${a.offerTat},
        features = ${JSON.stringify(a.features)}::jsonb, card_status = ${a.cardStatus},
        catalogue_missing_since = NULL, synced_at = now(), updated_at = now()
      WHERE id = ${p.id}`;
    log(`   · ${p.name}: ${p.changed.join(', ')}`);
  }
  for (const m of missing) {
    await q`UPDATE programmes SET catalogue_missing_since = COALESCE(catalogue_missing_since, now()) WHERE id = ${m.id}`;
    log(`   ! ${m.name}: not found in the catalogue any more (kept, flagged)`);
  }
  await q`UPDATE institutions SET portal_logo = ${catalogue.logo || null}, synced_at = now() WHERE id = ${instId}`;
  return { updated, unchanged, missing: missing.length };
}

export async function recordRun(run) {
  await ensureSchema();
  const q = sql();
  await q`INSERT INTO sync_runs (started_at, finished_at, trigger, institutions, updated, unchanged, missing, errors, log)
    VALUES (${run.startedAt}, now(), ${run.trigger}, ${run.institutions}, ${run.updated}, ${run.unchanged},
      ${run.missing}, ${run.errors}, ${JSON.stringify(run.log)}::jsonb)`;
}

export async function lastRuns(n = 10) {
  await ensureSchema();
  return sql()`SELECT id, started_at, finished_at, trigger, institutions, updated, unchanged, missing, errors
    FROM sync_runs ORDER BY id DESC LIMIT ${n}`;
}
