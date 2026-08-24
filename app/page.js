import data from '../lib/prime-data.json';
import PrimeList from './PrimeList';

export default function Home() {
  return <PrimeList data={data} />;
}
