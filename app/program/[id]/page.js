import Link from 'next/link';
import { notFound } from 'next/navigation';
import data from '../../../lib/prime-data.json';

function find(id) {
  for (const dest of data.destinations) {
    for (const inst of dest.institutions) {
      const prog = inst.programs.find((p) => p.id === id);
      if (prog) return { dest, inst, prog };
    }
  }
  return null;
}

export function generateStaticParams() {
  const out = [];
  for (const dest of data.destinations)
    for (const inst of dest.institutions)
      for (const prog of inst.programs) out.push({ id: prog.id });
  return out;
}

export function generateMetadata({ params }) {
  const hit = find(params.id);
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

export default function ProgramPage({ params }) {
  const hit = find(params.id);
  if (!hit) notFound();
  const { dest, inst, prog } = hit;
  const { features } = data;

  // Deep link into the portal. When we hold the catalogue's own programme id we
  // pass it through, so the portal can open that exact card.
  const portalUrl = prog.portalId
    ? `https://iapply.io/program-explorer?prgm_id=${prog.portalId}`
    : 'https://iapply.io/program-explorer';

  const cells = [
    ['Level', prog.level],
    ['Duration', prog.duration],
    ['Intakes', prog.intakes],
    ['Tuition fee', prog.tuition],
    prog.deadline ? ['Apply by', fmtDate(prog.deadline)] : null,
    prog.casDisplay ? [prog.depositLabel, prog.casDisplay] : null,
    ['English requirement', `IELTS ${prog.ielts}`],
    ['Institution type', inst.type],
    ['Campus', `${inst.campus} · ${inst.city}`],
  ].filter(Boolean);

  return (
    <main className="pp-wrap">
      <Link className="pp-back" href="/"><i className="bi bi-arrow-left" /> Back to Prime Institutions</Link>

      <div className="pp-head">
        <span className="pi-logo has-img" style={{ width: 62, height: 62 }}>
          {inst.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/logos/${inst.logo}`} alt={`${inst.name} logo`} />
          ) : (
            inst.name.slice(0, 2).toUpperCase()
          )}
        </span>
        <div>
          <h1 className="pp-title">{prog.name}</h1>
          <div className="pi-dim">
            {inst.name} · {dest.name}
          </div>
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

      <h2 className="pi-h3" style={{ fontSize: '1rem', margin: '1.4rem 0 .6rem' }}>Why this programme sells</h2>
      <div className="pi-usps">
        {prog.features.filter((f) => features[f]).map((f) => (
          <span className="pi-usp" key={f}><i className={`bi ${features[f].icon}`} />{features[f].label}</span>
        ))}
      </div>

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
          <p className="pi-dim small">
            Source: master product sheet (approved list). Internal use only — do not share with students.
          </p>
        </>
      )}

      <div className="pp-actions">
        <a className="pi-btn pi-btn-primary" href="https://iapply.io/outreachs/" target="_blank" rel="noopener noreferrer">
          <i className="bi bi-send-fill" /> Apply in the iApply portal
        </a>
        <a className="pi-btn pi-btn-ghost" href={portalUrl} target="_blank" rel="noopener noreferrer">
          <i className="bi bi-box-arrow-up-right" /> Open in Program Explorer
          {!prog.portalId && <span className="pi-dim small"> (search view)</span>}
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
