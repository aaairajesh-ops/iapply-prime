import { notFound } from 'next/navigation';
import { loadData } from '../../lib/store';
import { findDestination } from '../../lib/slug';
import PrimeList from '../PrimeList';

// /canada, /uk — the Prime page opened on that country's tab.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { dest } = await params;
  const d = findDestination(await loadData(), dest);
  if (!d) return { title: 'Not found' };
  const title = `iApply Prime ${d.name} — ${d.institutions.length} partner institutions`;
  return { title, openGraph: { title, type: 'website' } };
}

export default async function DestinationPage({ params }) {
  const { dest } = await params;
  const data = await loadData();
  const d = findDestination(data, dest);
  if (!d) notFound();
  return <PrimeList data={data} initialDest={d.code} />;
}
