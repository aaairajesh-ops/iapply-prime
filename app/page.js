import { loadData } from '../lib/store';
import PrimeList from './PrimeList';

// Read from Vercel Blob / Neon when connected, else from the bundled JSON. Always rendered fresh so a sync is visible on the next load.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const data = await loadData();
  return <PrimeList data={data} />;
}
