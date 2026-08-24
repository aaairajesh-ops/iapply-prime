'use client';

import { useMemo, useState } from 'react';

const initials = (name) => {
  const p = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  return ((p[0] || 'X')[0] + ((p[1] || '')[0] || '')).toUpperCase();
};

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
};

function Logo({ inst }) {
  const [failed, setFailed] = useState(false);
  if (!inst.logo || failed) return <span className="pi-logo">{initials(inst.name)}</span>;
  return (
    <span className="pi-logo has-img">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logos/${inst.logo}`} alt={`${inst.name} logo`} loading="lazy" onError={() => setFailed(true)} />
    </span>
  );
}

export default function PrimeList({ data }) {
  const { destinations, features, tags } = data;
  const [destCode, setDestCode] = useState(destinations[0].code);
  const [openInst, setOpenInst] = useState(null);
  const [commInst, setCommInst] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('tf');
  const [dir, setDir] = useState(-1);
  const [shortlist, setShortlist] = useState([]);
  const [sync, setSync] = useState({ running: false, log: [], at: null });

  const dest = destinations.find((d) => d.code === destCode);

  const programs = useMemo(() => {
    if (!openInst) return [];
    const list = openInst.programs.filter(
      (p) => filter === 'all' || (p.ptype || (/master|mba|llm|pg/i.test(p.level) ? 'pg' : 'ug')) === filter
    );
    const val = (p) => {
      if (sort === 'deadline') return p.deadline ? Date.parse(p.deadline) : Infinity;
      if (sort === 'cas') return typeof p.cas === 'number' ? p.cas : Infinity;
      return typeof p.tf === 'number' ? p.tf : Infinity;
    };
    return [...list].sort((a, b) => (val(a) - val(b)) * (sort === 'tf' ? dir : 1));
  }, [openInst, filter, sort, dir]);

  const toggleShortlist = (key) =>
    setShortlist((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  async function runSync() {
    setSync({ running: true, log: ['Starting sync from the iApply catalogue…'], at: null });
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const out = await res.json();
      setSync({
        running: false,
        log: out.log || [out.error || 'No response'],
        at: out.finishedAt || new Date().toISOString(),
      });
    } catch (e) {
      setSync({ running: false, log: ['Sync failed: ' + e.message], at: null });
    }
  }

  return (
    <>
      <header className="pi-topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/iapply.png" alt="iApply" height={30} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <strong style={{ marginLeft: '.6rem', letterSpacing: '-.02em' }}>Prime Institutions</strong>
        <div className="pi-topbar-right">
          <span className="pi-btn pi-btn-light">
            <i className="bi bi-bookmark-heart" /> Shortlist <span className="pi-count">{shortlist.length}</span>
          </span>
          <span className="pi-avatar"><i className="bi bi-person-fill" /></span>
        </div>
      </header>

      <div className="pi-shell">
        <main className="pi-main">
          <div className="pi-head">
            <div>
              <h1>Prime Institutions</h1>
              <p>
                Hand-picked partner institutions with the strongest outcomes for your students.{' '}
                <span className="pi-sample-badge">Commission from master sheet · catalogue data synced</span>
              </p>
            </div>
          </div>

          <div className="pi-syncbar">
            <button type="button" className="pi-btn pi-btn-primary" onClick={runSync} disabled={sync.running}>
              <i className={sync.running ? 'bi bi-arrow-repeat' : 'bi bi-cloud-download'} />
              {sync.running ? ' Syncing…' : ' Sync now'}
            </button>
            <span className="pi-dim">
              {sync.at ? `Last synced ${new Date(sync.at).toLocaleString()}` : 'Catalogue data · commission and bonus are never overwritten'}
            </span>
            {sync.log.length > 0 && <div className="pi-sync-log">{sync.log.join('\n')}</div>}
          </div>

          <div className="pi-tabs" role="tablist">
            {destinations.map((d) => (
              <button
                key={d.code}
                type="button"
                role="tab"
                className={'pi-tab' + (d.code === destCode ? ' is-on' : '')}
                style={{ '--tc1': d.theme[0], '--tc2': d.theme[1] }}
                onClick={() => setDestCode(d.code)}
              >
                {d.flagImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pi-flag-img" src={`/logos/${d.flagImg}`} alt="" />
                ) : (
                  <span className="pi-flag">{d.flag}</span>
                )}{' '}
                {d.name} <span className="pi-tab-n">{d.institutions.length}</span>
                {d.popular && (
                  <span className="pi-pop-tag"><i className="bi bi-fire" /> Most popular</span>
                )}
              </button>
            ))}
          </div>

          <div className="pi-grid">
            {dest.institutions.map((inst) => (
              <div
                key={inst.id}
                className="pi-inst"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (e.target.closest('[data-comm]') || e.target.closest('.pi-contact')) return;
                  setOpenInst(inst); setFilter('all'); setSort('tf'); setDir(dest.code === 'canada' ? -1 : 1);
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setOpenInst(inst); } }}
              >
                <div className="pi-inst-top">
                  <Logo inst={inst} />
                  {dest.code === 'uk' && inst.contact && (
                    <span className="pi-contact">
                      <i className="bi bi-telephone-fill" />
                      <a className="pi-contact-num" href={`tel:${inst.contact.replace(/[^+0-9]/g, '')}`}>
                        {inst.contact}
                      </a>
                    </span>
                  )}
                </div>
                <div className="pi-inst-title">
                  <strong>{inst.name}</strong>
                  {(inst.progTags || []).slice(0, 2).map((t) =>
                    tags[t] ? (
                      <span key={t} className={`pi-flash pi-flash-${tags[t].tone} pi-flash-sm`}>{tags[t].label}</span>
                    ) : null
                  )}
                </div>
                <div className="pi-dim">{inst.campus} · {inst.city}</div>

                {inst.commission && (
                  <div
                    className={'pi-comm pi-comm-mini' + (inst.hasBonus ? ' has-bonus' : '')}
                    data-comm={inst.id}
                    role="button"
                    tabIndex={0}
                    title="See commission details"
                    onClick={(e) => { e.stopPropagation(); setCommInst(inst); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setCommInst(inst); } }}
                  >
                    <i className="bi bi-cash-coin" /> Commission <b>{inst.commission}</b>
                    {inst.hasBonus && <span className="pi-bonus-tag"><i className="bi bi-stars" />BONUS</span>}
                    <span className="pi-comm-sample">
                      {inst.commissionSource === 'sheet' ? 'master sheet' : 'sample'}
                    </span>
                  </div>
                )}

                {inst.bestFor && (
                  <span className="pi-best"><i className="bi bi-bullseye" /> {inst.bestFor}</span>
                )}
                <div className="pi-inst-foot">
                  <span className="pi-chip-type">{inst.type}</span>
                  <span className="pi-dim small">
                    {inst.programs.length} programs <i className="bi bi-arrow-right-circle-fill" />
                  </span>
                </div>
              </div>
            ))}
          </div>
          {dest.institutions.length === 0 && (
            <div className="pi-empty">
              <i className="bi bi-binoculars" />
              <p>Prime institutions for this destination are being finalised.</p>
            </div>
          )}
        </main>
      </div>

      {/* ---------------- institution / programme popup ---------------- */}
      {openInst && (
        <div className="pi-modal" role="dialog" aria-modal="true">
          <div className="pi-modal-backdrop" onClick={() => setOpenInst(null)} />
          <div className="pi-modal-panel">
            <div className="pi-modal-head">
              <div className="pi-inst-id">
                <Logo inst={openInst} />
                <div>
                  <strong>{openInst.name}</strong>
                  <div className="pi-dim">
                    {openInst.campus} · {openInst.city} · {openInst.type}
                    {dest.code === 'uk' && openInst.contact ? ` · ☎ ${openInst.contact}` : ''}
                  </div>
                </div>
              </div>
              <button type="button" className="pi-close" onClick={() => setOpenInst(null)} aria-label="Close">
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="pi-toolbar">
              <div className="pi-toolbar-group" role="group" aria-label="Filter by level">
                {[['all', 'All levels'], ['pg', 'Postgraduate'], ['ug', 'Undergraduate']].map(([k, label]) => (
                  <button key={k} type="button" className={'pi-tool' + (filter === k ? ' is-on' : '')} onClick={() => setFilter(k)}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="pi-toolbar-group" role="group" aria-label="Sort">
                <span className="pi-dim small"><i className="bi bi-sort-down-alt" /> Sort by</span>
                <button type="button" className={'pi-tool' + (sort === 'tf' ? ' is-on' : '')}
                  onClick={() => { if (sort === 'tf') setDir(-dir); setSort('tf'); }}>
                  Tuition fee <i className={`bi bi-arrow-${dir === -1 ? 'down' : 'up'}-short`} />
                </button>
                <button type="button" className={'pi-tool' + (sort === 'deadline' ? ' is-on' : '')} onClick={() => setSort('deadline')}>
                  Application deadline
                </button>
                <button type="button" className={'pi-tool' + (sort === 'cas' ? ' is-on' : '')} onClick={() => setSort('cas')}>
                  Deposit <i className="bi bi-arrow-up-short" />
                </button>
              </div>
            </div>

            <div className="pi-modal-body">
              {programs.map((prog) => {
                const key = `${openInst.id}::${prog.name}`;
                return (
                  <div className="pi-prog" key={prog.id}>
                    <div className="pi-prog-title">
                      {/* Programme name opens its own page in a NEW TAB - each programme owns a URL */}
                      <a className="pi-prog-link" href={`/program/${prog.id}`} target="_blank" rel="noopener noreferrer">
                        <strong>{prog.name}</strong>
                        <i className="bi bi-box-arrow-up-right" />
                      </a>
                      {(prog.tags || []).map((t) =>
                        tags[t] ? <span key={t} className={`pi-flash pi-flash-${tags[t].tone}`}>{tags[t].label}</span> : null
                      )}
                    </div>
                    <div className="pi-prog-meta">
                      <span><i className="bi bi-mortarboard" />{prog.level}</span>
                      <span><i className="bi bi-hourglass-split" />{prog.duration}</span>
                      <span><i className="bi bi-calendar-event" />{prog.intakes}</span>
                      <span><i className="bi bi-cash-stack" />{prog.tuition}</span>
                      {prog.deadline && <span><i className="bi bi-calendar-x" />Apply by {fmtDate(prog.deadline)}</span>}
                      {prog.casDisplay && <span><i className="bi bi-bank" />{prog.depositLabel} {prog.casDisplay}</span>}
                      <span><i className="bi bi-translate" />IELTS {prog.ielts}</span>
                    </div>

                    {prog.commission && (
                      <div className={'pi-comm' + (openInst.hasBonus ? ' has-bonus' : '')}
                        role="button" tabIndex={0} title="See commission details"
                        onClick={() => setCommInst(openInst)}
                        onKeyDown={(e) => { if (e.key === 'Enter') setCommInst(openInst); }}>
                        <i className="bi bi-cash-coin" /> Your commission: <b>{prog.commission}</b>
                        {openInst.hasBonus && (
                          <span className="pi-bonus-tag"><i className="bi bi-stars" />BONUS {openInst.bonusShort || ''}</span>
                        )}
                        <span className="pi-comm-sample">
                          {prog.commissionSource === 'sheet' ? 'master sheet' : 'sample rate'}
                        </span>
                      </div>
                    )}

                    <div className="pi-usps">
                      {prog.features.filter((f) => features[f]).map((f) => (
                        <span className="pi-usp" key={f}>
                          <i className={`bi ${features[f].icon}`} />{features[f].label}
                        </span>
                      ))}
                    </div>

                    <div className="pi-prog-ctas">
                      <button type="button" className={'pi-btn pi-btn-ghost' + (shortlist.includes(key) ? ' is-active' : '')}
                        onClick={() => toggleShortlist(key)}>
                        <i className="bi bi-bookmark-heart" /> <span>{shortlist.includes(key) ? 'Shortlisted' : 'Shortlist'}</span>
                      </button>
                      <a className="pi-btn pi-btn-ghost" href={`/program/${prog.id}`} target="_blank" rel="noopener noreferrer">
                        <i className="bi bi-clipboard-check" /> See details &amp; check eligibility
                      </a>
                      <a className="pi-btn pi-btn-primary" href="https://iapply.io/outreachs/" target="_blank" rel="noopener noreferrer">
                        <i className="bi bi-send-fill" /> Apply now
                      </a>
                    </div>
                  </div>
                );
              })}
              {programs.length === 0 && (
                <p className="pi-dim" style={{ textAlign: 'center', padding: '1rem' }}>No programs at this level.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- commission detail popup ---------------- */}
      {commInst && (
        <div className="pi-modal" role="dialog" aria-modal="true">
          <div className="pi-modal-backdrop" onClick={() => setCommInst(null)} />
          <div className="pi-modal-panel pi-panel-sm">
            <div className="pi-modal-head">
              <strong><i className="bi bi-cash-coin" /> Commission — {commInst.name}</strong>
              <button type="button" className="pi-close" onClick={() => setCommInst(null)} aria-label="Close">
                <i className="bi bi-x-lg" />
              </button>
            </div>
            <div className="pi-modal-body">
              {[
                ['iApply commission', commInst.commissionDetail?.text || commInst.commission, ''],
                commInst.hasBonus ? ['Bonus', `${commInst.bonusShort} — included in the line above`, 'is-bonus'] : null,
                ['Bonus / offer deadline', commInst.commissionDetail?.deadline, ''],
                ['Target', commInst.commissionDetail?.target, ''],
                ['Free border pass', commInst.commissionDetail?.border_pass, ''],
              ]
                .filter((r) => r && r[1])
                .map(([label, val, cls]) => (
                  <div className={'pi-comm-row ' + cls} key={label}>
                    <span>{label}</span>
                    <b>{val}</b>
                  </div>
                ))}
              <p className="pi-dim small" style={{ margin: '.9rem 0 0' }}>
                Source: master product sheet (approved list). Internal use only — do not share with students.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
