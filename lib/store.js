// Storage switch. Pick the backend from the environment:
//   BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID -> Vercel Blob (default: free, Vercel-only)
//   DATABASE_URL           -> Neon Postgres (optional upgrade if SQL is ever needed)
//   neither                -> bundled JSON, read-only (Sync now previews)
// PRIME_STORE=blob|neon|json forces one explicitly.

import * as neon from './db';
import * as blob from './blob-store';
import { ensureSlugs } from './slug';

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

// Slugs/paths are stored in the dataset, but they are also derived here so a
// blob written before share links existed still resolves correctly.
export async function loadData() {
  const kind = storeKind();
  const data = kind === 'json' ? neon.localData() : await backend().loadData();
  return ensureSlugs(data);
}

export const applyInstitution = (...a) => backend().applyInstitution(...a);
export const recordRun = (...a) => backend().recordRun(...a);
export const lastRuns = (...a) => backend().lastRuns(...a);
export const seedFromJson = (...a) => backend().seedFromJson(...a);
export async function prepare() {
  if (storeKind() === 'neon') await neon.ensureSchema();
}
