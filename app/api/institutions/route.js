import { NextResponse } from 'next/server';
import { loadData } from '../../../lib/store';

// Read-only JSON of the current dataset (database when configured, else the
// bundled file). Used by the UI to refresh after a sync without a full reload.
export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await loadData();
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
