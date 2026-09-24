import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { loadData } from '../../../../lib/store';
import { bonusExtra, findInstitution } from '../../../../lib/slug';

// Link-preview thumbnail for one institution, 1200x630 (what WhatsApp,
// Facebook, LinkedIn and Telegram all expect):
//   /og/canada/niagara-college.png
// Drawn from the same data as the page, so it never disagrees with it.
export const dynamic = 'force-dynamic';

const W = 1200, H = 630;

// Inter, the page's own font, in the three weights the card uses (Open Font
// License). Loaded once per server instance.
let fonts = null;
async function loadFonts() {
  if (fonts) return fonts;
  const dir = join(process.cwd(), 'assets', 'fonts');
  const [m, b, x] = await Promise.all(['Inter-Medium.ttf', 'Inter-Bold.ttf', 'Inter-ExtraBold.ttf'].map((f) => readFile(join(dir, f))));
  fonts = [
    { name: 'Inter', data: m, weight: 500, style: 'normal' },
    { name: 'Inter', data: b, weight: 700, style: 'normal' },
    { name: 'Inter', data: x, weight: 800, style: 'normal' },
  ];
  return fonts;
}

async function dataUri(url) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || 'image/png';
    if (!/png|jpe?g|gif/i.test(type)) return null; // the renderer reads these only
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

const initials = (name) =>
  name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join('') || 'iA';

export async function GET(req, { params }) {
  const { dest: destSeg, file } = await params;
  const data = await loadData();
  const hit = findInstitution(data, destSeg, String(file).replace(/\.(png|jpe?g)$/i, ''));
  if (!hit) return new Response('Not found', { status: 404 });
  const { dest, inst } = hit;

  const origin = new URL(req.url).origin;
  const [logo, brand, flag, fontList] = await Promise.all([
    inst.logo ? dataUri(`${origin}/logos/${inst.logo}`) : inst.portalLogo ? dataUri(inst.portalLogo) : null,
    dataUri(`${origin}/logos/iapply.png`),
    dest.flagImg ? dataUri(`${origin}/logos/${dest.flagImg}`) : null,
    loadFonts().catch(() => null),
  ]);

  const [c1, c2] = dest.theme || ['#0f766e', '#134e4a'];
  const n = inst.programs.length;
  const campusCount = inst.campuses && inst.campuses.length ? inst.campuses.length : 1;
  const extra = bonusExtra(inst);
  const nameSize = inst.name.length > 34 ? 50 : inst.name.length > 24 ? 58 : 66;
  const cl = (inst.commission || '').length;
  const commSize = cl > 30 ? 34 : cl > 20 ? 40 : 46;

  const stat = (big, small) => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '14px 22px', borderRadius: 18, background: '#f1f5f9', marginRight: 14 }}>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 800, color: '#0f172a' }}>{big}</div>
      <div style={{ display: 'flex', fontSize: 20, color: '#475569' }}>{small}</div>
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', background: '#ffffff', fontFamily: 'Inter', fontWeight: 500 }}>
        {/* country-coloured side with the institution logo */}
        <div style={{ width: 400, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backgroundImage: `linear-gradient(160deg, ${c1}, ${c2})` }}>
          <div style={{ width: 270, height: 270, borderRadius: 40, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,.25)' }}>
            {logo
              ? <img src={logo} width={210} height={210} style={{ objectFit: 'contain' }} />
              : <div style={{ display: 'flex', fontSize: 110, fontWeight: 800, color: c1 }}>{initials(inst.name)}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 34, color: '#fff', fontSize: 32, fontWeight: 700 }}>
            {flag && <img src={flag} width={52} height={36} style={{ borderRadius: 6, marginRight: 14 }} />}
            {dest.name}
          </div>
        </div>

        {/* the pitch */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '44px 56px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {brand ? <img src={brand} height={44} style={{ height: 44 }} /> : <div style={{ display: 'flex', fontSize: 36, fontWeight: 800 }}>iapply</div>}
            <div style={{ display: 'flex', marginLeft: 18, padding: '8px 18px', borderRadius: 999, background: '#fef3c7', color: '#92400e',
              fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>PRIME INSTITUTION</div>
          </div>

          <div style={{ display: 'flex', marginTop: 28, fontSize: nameSize, fontWeight: 800, color: '#0f172a', lineHeight: 1.08 }}>{inst.name}</div>
          <div style={{ display: 'flex', marginTop: 12, fontSize: 26, color: '#475569' }}>
            {[campusCount > 1 ? `${campusCount} campuses` : inst.campus, inst.city].filter(Boolean).join(' · ')}
          </div>

          {inst.commission && (
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26, padding: '18px 26px', borderRadius: 22,
              border: '3px solid #f59e0b', backgroundImage: 'linear-gradient(120deg, #fffbeb, #fde68a)' }}>
              <div style={{ display: 'flex', alignItems: 'center', fontSize: 20, fontWeight: 800, color: '#92400e', letterSpacing: 2 }}>
                YOUR COMMISSION
                {inst.hasBonus && (
                  <div style={{ display: 'flex', marginLeft: 16, padding: '4px 14px', borderRadius: 999, color: '#fff', letterSpacing: 1,
                    backgroundImage: 'linear-gradient(90deg, #ea580c, #b45309)', fontSize: 18 }}>BONUS</div>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', marginTop: 6 }}>
                <div style={{ display: 'flex', fontSize: commSize, fontWeight: 800, color: '#78350f' }}>{inst.commission}</div>
                {extra && <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: '#c2410c', marginLeft: 14 }}>{extra}</div>}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', marginTop: 'auto', alignItems: 'flex-end' }}>
            {stat(n, n === 1 ? 'programme' : 'programmes')}
            {stat(campusCount, campusCount === 1 ? 'campus' : 'campuses')}
            <div style={{ display: 'flex', marginLeft: 'auto', padding: '16px 26px', borderRadius: 18, background: '#16a34a', color: '#fff',
              fontSize: 26, fontWeight: 800 }}>View &amp; apply →</div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      ...(fontList ? { fonts: fontList } : {}),
      // WhatsApp and friends cache previews; a day keeps rates fresh enough
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    }
  );
}
