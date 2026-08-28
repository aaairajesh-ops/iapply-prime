import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadData } from '../../../lib/store';
import { classifyIntakes, intakeFlash, isOnshore } from '../../../lib/intakes';

// Programme pages read the live dataset (database when configured).
export const dynamic = 'force-dynamic';

async function find(id) {
  const data = await loadData();
  for (const dest of data.destinations) {
    for (const inst of dest.institutions) {
      const prog = inst.programs.find((p) => p.id === id);
      if (prog) return { data, dest, inst, prog };
    }
  }
  return null;
}

export async function generateMetadata({ params }) {
  const { id } = await params; // params is async from Next 15 onwards
  const hit = await find(id);
  return {
    title: hit ? `${hit.prog.name} — ${hit.inst.name}` : 'Programme not found',
    robots: { index: false, follow: false },
  };
}

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
};

export default async function ProgramPage({ params }) {
  const { id } = await params;
  const hit = await find(id);
  if (!hit) notFound();
  const { data, dest, inst, prog } = hit;
  const { features } = data;
  const now = new Date();
  const flash = intakeFlash(prog.intakeList, now);
  const { immediate, past } = classifyIntakes(prog.intakeList, now);

  // Deep link into the portal. When we hold the catalogue's own programme id we
  // pass it through, so the portal can open that exact card.
  const portalUrl = inst.portalUniId
    ? `https://iapply.io/outreachs/search-program?c_id=${inst.portalCountryId}&u_id=${inst.portalUniId}`
    : 'https://iapply.io/outreachs/search-program';

  const cells = [
    ['Level', prog.level],
    ['Duration', prog.duration],
    ['Intakes', (
      <span className="pi-intakes" key="intakes">
        {(prog.intakeList || []).map((i) => {
          const soon = immediate.some((x) => x.label === i.label);
          const gone = past.some((x) => x.label === i.label) || /^clos/i.test(i.status || '');
          return (
            <span key={i.label} title={i.status && i.status !== 'unknown' ? `${i.label} · ${i.status}` : i.label}
              className={'pi-intake' + (soon ? ' is-soon' : '') + (gone ? ' is-past' : '') + (isOnshore(i.status) ? ' is-onshore' : '')}>
              {i.label}{isOnshore(i.status) ? ' · onshore' : ''}
            </span>
          );
        })}
        {(!prog.intakeList || prog.intakeList.length === 0) && (prog.intakes || '—')}
      </span>
    )],
    ['Tuition fee', prog.tuition],
    prog.applicationFee ? ['Application fee', prog.applicationFee] : null,
    prog.offerTat ? ['Offer letter TAT', prog.offerTat] : null,
    ['Institution type', inst.type],
    ['Campus', `${inst.campus} · ${inst.city}`],
  ].filter(Boolean);

  return (
    <main className="pp-wrap">
      <Link className="pp-back" href="/"><i className="bi bi-arrow-left" /> Back to Prime Institutions</Link>

      <div className="pp-head">
        <span className="pi-logo has-img" style={{ width: 62, height: 62 }}>
          {inst.logo || inst.portalLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inst.logo ? `/logos/${inst.logo}` : inst.portalLogo} alt={`${inst.name} logo`} />
          ) : (
            inst.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <div>
          <h1 className="pp-title">{prog.name}</h1>
          <div className="pi-dim">
            {inst.name} · {dest.name}
          </div>
          {flash && (
            <span className={'pi-intake-flash is-' + flash.tone} title={flash.detail}>
              <i className={flash.tone === 'onshore' ? 'bi bi-geo-alt-fill' : 'bi bi-broadcast'} />
              <b>{flash.title}</b>
              <span className="pi-intake-flash-detail">{flash.detail}</span>
            </span>
          )}
        </div>
      </div>

      {prog.commission && (
        <div className={'pi-comm' + (inst.hasBonus ? ' has-bonus' : '')} style={{ cursor: 'default' }}>
          <i className="bi bi-cash-coin" /> Your commission: <b>{prog.commission}</b>
          {inst.hasBonus && (
            <span className="pi-bonus-tag"><i className="bi bi-stars" />BONUS {inst.bonusShort || ''}</span>
          )}
          <span className="pi-comm-sample">
            {prog.commissionSource === 'sheet' ? 'master sheet' : 'sample rate'}
          </span>
        </div>
      )}

      <div className="pp-grid">
        {cells.map(([label, val]) => (
          <div className="pp-cell" key={label}>
            <span>{label}</span>
            <b>{val}</b>
          </div>
        ))}
      </div>

      {prog.features.filter((f) => features[f]).length > 0 && (
        <>
          <h2 className="pi-h3" style={{ fontSize: '1rem', margin: '1.4rem 0 .6rem' }}>What the catalogue lists</h2>
          <div className="pi-usps">
            {prog.features.filter((f) => features[f]).map((f) => (
              <span className="pi-usp" key={f}><i className={`bi ${features[f].icon}`} />{features[f].label}</span>
            ))}
          </div>
        </>
      )}

      {inst.commissionDetail && (
        <>
          <h2 className="pi-h3" style={{ fontSize: '1rem', margin: '1.4rem 0 .6rem' }}>Commission detail</h2>
          {[
            ['iApply commission', inst.commissionDetail.text],
            inst.hasBonus ? ['Bonus', inst.bonusShort] : null,
            ['Bonus / offer deadline', inst.commissionDetail.deadline],
            ['Target', inst.commissionDetail.target],
            ['Free border pass', inst.commissionDetail.border_pass],
          ]
            .filter((r) => r && r[1])
            .map(([label, val]) => (
              <div className="pi-comm-row" key={label}>
                <span>{label}</span>
                <b>{val}</b>
              </div>
            ))}

        </>
      )}

      <div className="pp-actions">
        <a className="pi-btn pi-btn-primary" href={portalUrl} target="_blank" rel="noopener noreferrer">
          <i className="bi bi-send-fill" /> Apply now in the iApply portal
        </a>
        <a className="pi-btn pi-btn-ghost" href={portalUrl} target="_blank" rel="noopener noreferrer">
          <i className="bi bi-box-arrow-up-right" /> Open in Program Explorer
        </a>
        {inst.contact && dest.code === 'uk' && (
          <a className="pi-btn pi-btn-ghost" href={`tel:${inst.contact.replace(/[^+0-9]/g, '')}`}>
            <i className="bi bi-telephone-fill" /> {inst.contact}
          </a>
        )}
      </div>
    </main>
  );
}
