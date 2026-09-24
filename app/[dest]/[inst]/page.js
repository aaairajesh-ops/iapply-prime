import { notFound } from 'next/navigation';
import { loadData } from '../../../lib/store';
import { findInstitution, institutionPath, institutionPitch } from '../../../lib/slug';
import PrimeList from '../../PrimeList';

// One promotable link per institution:
//   /canada/niagara-college
// Opens the Prime page with that institution's programmes already on screen,
// and carries its own WhatsApp / social preview (title, pitch, thumbnail).
export const dynamic = 'force-dynamic';

async function find(params) {
  const { dest, inst } = await params;
  const data = await loadData();
  const hit = findInstitution(data, dest, inst);
  return hit ? { data, ...hit } : null;
}

export async function generateMetadata({ params }) {
  const hit = await find(params);
  if (!hit) return { title: 'Institution not found', robots: { index: false, follow: false } };
  const { dest, inst } = hit;
  const path = institutionPath(dest, inst);
  const title = `${inst.name} — iApply Prime ${dest.name}`;
  const description = `${institutionPitch(dest, inst)}. Tap to see programmes, fees, intakes and apply.`;
  const image = { url: `/og${path}.png`, width: 1200, height: 630, alt: `${inst.name} on iApply Prime` };
  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: 'iApply Prime Institutions', type: 'website', images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}

export default async function InstitutionPage({ params }) {
  const hit = await find(params);
  if (!hit) notFound();
  return <PrimeList data={hit.data} initialDest={hit.dest.code} initialInst={hit.inst.id} />;
}
