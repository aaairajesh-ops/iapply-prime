// Storage switch. Pick the backend from the environment:
//   BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID -> Vercel Blob (default: free, Vercel-only)
//   DATABASE_URL           -> Neon Postgres (optional upgrade if SQL is ever needed)
//   neither                -> bundled JSON, read-only (Sync now previews)
// PRIME_STORE=blob|neon|json forces one explicitly.

import * as neon from './db';
import * as blob from './blob-store';
import { ensureSlugs } from './slug';
import master from './prime-data.json';

export { diffInstitution } from './db';

export function storeKind() {
  const forced = (process.env.PRIME_STORE || '').toLowerCase();
  if (forced === 'blob' || forced === 'neon' || forced === 'json') return forced;
  if (blob.hasBlob()) return 'blob';
  if (neon.hasDb()) return 'neon';
  return 'json';
}

export const isPersistent = () => storeKind() !== 'json';

const backend = () => (storeKind() === 'blob' ? blob : neon);

// The master sheet (lib/prime-data.json) owns commission / bonus / "best for"
// and the order institutions appear in. Overlay those on whatever the store
// holds, so changing them is just a deploy — the stored copy only has to
// supply catalogue fields (fees, intakes, TAT, badges) from the last sync.
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const MASTER_FIELDS = neon.LOCKED_INSTITUTION_FIELDS.map(camel);

function overlayMaster(data) {
  return {
    ...data,
    destinations: master.destinations.map((md) => {
      const cur = data.destinations.find((d) => d.code === md.code);
      if (!cur) return md;
      const stored = new Map(cur.institutions.map((i) => [i.id, i]));
      const institutions = md.institutions.map((mi) => {
        const si = stored.get(mi.id);
        if (!si) return mi;
        const out = { ...si };
        for (const f of MASTER_FIELDS) out[f] = mi[f] === undefined ? null : mi[f];
        return out;
      });
      return { ...cur, institutions };
    }),
  };
}

// Slugs/paths are stored in the dataset, but they are also derived here so a
// blob written before share links existed still resolves correctly.
export async function loadData() {
  const kind = storeKind();
  const data = kind === 'json' ? neon.localData() : overlayMaster(await backend().loadData());
  return ensureSlugs(data);
}

export const applyInstitution = (...a) => backend().applyInstitution(...a);
export const recordRun = (...a) => backend().recordRun(...a);
export const lastRuns = (...a) => backend().lastRuns(...a);
export const seedFromJson = (...a) => backend().seedFromJson(...a);
export async function prepare() {
  if (storeKind() === 'neon') await neon.ensureSchema();
}
