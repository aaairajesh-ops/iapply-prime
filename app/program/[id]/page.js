import { permanentRedirect, notFound } from 'next/navigation';
import { loadData } from '../../../lib/store';
import { findById } from '../../../lib/slug';

// Legacy link shape. Every /program/<id> URL that was ever shared keeps
// working and lands on the readable one:
//   /program/crandall-master-of-management
//   -> /canada/crandall-university/master-of-management
export const dynamic = 'force-dynamic';

export default async function LegacyProgramPage({ params }) {
  const { id } = await params;
  const hit = findById(await loadData(), id);
  if (!hit) notFound();
  permanentRedirect(hit.prog.path);
}
