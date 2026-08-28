'use client';

import { useMemo, useState } from 'react';
import { classifyIntakes, intakeFlash, isOnshore, normaliseProgramIntakes, IMMEDIATE_WINDOW_MONTHS } from '../lib/intakes';

const NOW = () => new Date();

// Programme pill: pulses when an intake is open now (current month + next few).
function IntakeFlash({ prog }) {
  const f = intakeFlash(prog.intakeList, NOW());
  if (!f) return null;
  return (
    <span className={'pi-intake-flash is-' + f.tone} title={f.detail}>
      <i className={f.tone === 'onshore' ? 'bi bi-geo-alt-fill' : 'bi bi-broadcast'} />
      <b>{f.title}</b>
      <span className="pi-intake-flash-detail">{f.detail}</span>
    </span>
  );
}

// Every intake the catalogue lists, coloured by how soon it is / its status.
function IntakeChips({ prog }) {
  const { immediate, past } = classifyIntakes(prog.intakeList, NOW());
  if (!prog.intakeList || prog.intakeList.length === 0) return null;
  return (
    <span className="pi-intakes">
      <i className="bi bi-calendar-event" />
      {prog.intakeList.map((i) => {
        const soon = immediate.some((x) => x.label === i.label);
        const gone = past.some((x) => x.label === i.label) || /^clos/i.test(i.status || '');
        const cls = 'pi-intake' + (soon ? ' is-soon' : '') + (gone ? ' is-past' : '') + (isOnshore(i.status) ? ' is-onshore' : '');
        return (
          <span key={i.label} className={cls} title={i.status && i.status !== 'unknown' ? `${i.label} · ${i.status}` : i.label}>
            {i.label}{isOnshore(i.status) ? ' · onshore' : ''}
          </span>
        );
      })}
    </span>
  );
}

const initials = (name) => {
  const p = name.split(/\s+/).filter((w) => /^[A-Z]/.test(w));
  return ((p[0] || 'X')[0] + ((p[1] || '')[0] || '')).toUpperCase();
};

// Deep link into the portal's Search Program for this institution. The portal
// lists that university's programmes; "View Details" there opens the exact card.
const portalUrl = (inst) =>
  inst.portalUniId
    ? `https://iapply.io/outreachs/search-program?c_id=${inst.portalCountryId}&u_id=${inst.portalUniId}`
    : 'https://iapply.io/outreachs/search-program';

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

// Smart filters run only on fields the catalogue actually publishes.
const SMART = [
  { key: 'scholarship', label: 'Scholarship available', icon: 'bi-award', test: (p) => p.features.includes('scholarship') },
  { key: 'express_offer', label: 'Express offer', icon: 'bi-lightning-charge', test: (p) => p.features.includes('express_offer') },
  { key: 'low_tuition', label: 'Low tuition fee', icon: 'bi-cash-coin', test: (p) => p.features.includes('low_tuition') },
  { key: 'backlogs_allowed', label: 'Backlogs allowed', icon: 'bi-clipboard-check', test: (p) => p.features.includes('backlogs_allowed') },
  { key: 'fast_tat', label: 'Offer in 7 days or less', icon: 'bi-stopwatch', test: (p) => {
      const m = (p.offerTat || '').match(/(\d+)/); return m && Number(m[1]) <= 7; } },
  { key: 'immediate', label: 'Immediate intakes', icon: 'bi-broadcast', hot: true,
    title: `Intake in the current month or the next ${IMMEDIATE_WINDOW_MONTHS} months`,
    test: (p) => classifyIntakes(p.intakeList, NOW()).immediate.length > 0 },
  { key: 'onshore', label: 'Onshore only', icon: 'bi-geo-alt-fill', hot: true,
    title: 'Immediate intakes the catalogue marks "Open (Onshore Only)"',
    test: (p) => classifyIntakes(p.intakeList, NOW()).onshore.length > 0 },
  { key: 'intake_2027', label: '2027 intake', icon: 'bi-calendar-event', test: (p) => (p.intakeList || []).some((i) => i.year === 2027) },
];

const immediateCount = (inst) => inst.programs.filter((p) => classifyIntakes(p.intakeList, NOW()).immediate.length > 0).length;
const onshoreCount = (inst) => inst.programs.filter((p) => classifyIntakes(p.intakeList, NOW()).onshore.length > 0).length;

const normalise = (data) => ({
  ...data,
  destinations: data.destinations.map((d) => ({
    ...d,
    institutions: d.institutions.map((i) => ({ ...i, programs: i.programs.map(normaliseProgramIntakes) })),
  })),
});

export default function PrimeList({ data: initial }) {
  const [data, setData] = useState(() => normalise(initial));
  const { destinations, features } = data;
  const [destCode, setDestCode] = useState(destinations[0].code);
  const [openInst, setOpenInst] = useState(null);
  const [commInst, setCommInst] = useState(null);
  const [filter, setFilter] = useState('all');
  const [smart, setSmart] = useState([]);
  const [sort, setSort] = useState('tf');
  const [dir, setDir] = useState(-1);
  const [shortlist, setShortlist] = useState([]);
  const [sync, setSync] = useState({ running: false, log: [], at: data.lastSyncedAt || null, persisted: data.source === 'database' || data.source === 'blob', store: data.source });

  const dest = destinations.find((d) => d.code === destCode);
  const toggleSmart = (k) => setSmart((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  // how many institutions have at least one programme matching the smart filters
  const matches = (p) =>
    (filter === 'all' || p.ptype === filter) &&
    smart.every((k) => SMART.find((s) => s.key === k).test(p));

  const visibleInsts = useMemo(
    () => dest.institutions.filter((i) => (smart.length === 0 && filter === 'all') || i.programs.some(matches)),
    [dest, smart, filter] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const programs = useMemo(() => {
    if (!openInst) return [];
    const list = openInst.programs.filter(matches);
    const val = (p) => (typeof p.tf === 'number' ? p.tf : Infinity);
    if (sort === 'tat')
      return [...list].sort((a, b) => (Number((a.offerTat || '').match(/\d+/)?.[0] ?? 9999)) - (Number((b.offerTat || '').match(/\d+/)?.[0] ?? 9999)));
    return [...list].sort((a, b) => (val(a) - val(b)) * dir);
  }, [openInst, filter, smart, sort, dir]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleShortlist = (key) =>
    setShortlist((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  // Sync one institution at a time so the log streams and no single request
  // runs long enough to hit Vercel's limit; the server paces portal calls.
  async function runSync() {
    const all = destinations.flatMap((d) => d.institutions);
    const log = [`Syncing ${all.length} institutions from the iApply catalogue…`];
    setSync((s) => ({ ...s, running: true, log: [...log] }));
    const totals = { updated: 0, unchanged: 0, missing: 0, errors: 0 };
    let persisted = false; let store = data.source;
    for (const inst of all) {
      try {
        const res = await fetch(`/api/sync?inst=${encodeURIComponent(inst.id)}`, { method: 'POST' });
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || `HTTP ${res.status}`);
        persisted = out.persisted; store = out.store || store;
        for (const line of (out.log || []).filter((l) => l.startsWith('✓') || l.startsWith('✗') || l.startsWith('   '))) log.push(line);
        for (const k of Object.keys(totals)) totals[k] += out.counts?.[k] || 0;
      } catch (e) {
        totals.errors++;
        log.push(`✗ ${inst.id}: ${e.message}`);
      }
      setSync((s) => ({ ...s, log: [...log] }));
    }
    log.push('');
    log.push(`Done — ${totals.updated} programmes updated, ${totals.unchanged} unchanged, ${totals.missing} flagged missing, ${totals.errors} errors.`);
    log.push('Commission, bonus, target and "best for" were NOT touched (they come from the master sheet).');
    if (!persisted) log.push('Note: no storage connected yet — this was a read-only preview. Create a Blob store in Vercel (free) to persist.');
    let at = new Date().toISOString();
    if (persisted) {
      try {
        const fresh = await fetch('/api/institutions', { cache: 'no-store' }).then((r) => r.json());
        const next = normalise(fresh);
        setData(next);
        if (openInst) setOpenInst(next.destinations.flatMap((d) => d.institutions).find((i) => i.id === openInst.id) || null);
        at = fresh.lastSyncedAt || at;
      } catch { /* keep what we have */ }
    }
    setSync({ running: false, log, at, persisted, store });
  }

  return (
    <>
      <header className="pi-topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/iapply.png" alt="iApply" height={30} />
        <nav className="pi-topnav">
          <span className="is-on">Prime Institutions</span>
          <a href="/test-prep">Test Prep</a>
        </nav>
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
                Programme data is read from the iApply Program Explorer catalogue.{' '}
                <span className="pi-sample-badge">Commission from the master sheet</span>
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
              {' · '}{sync.persisted ? `saved to ${sync.store === 'blob' ? 'Vercel Blob' : 'database'}` : 'preview only (no storage)'}
            </span>
            {sync.log.length > 0 && <div className="pi-sync-log">{sync.log.join('\n')}</div>}
          </div>

          <div className="pi-tabs" role="tablist">
            {destinations.map((d) => (
              <button key={d.code} type="button" role="tab"
                className={'pi-tab' + (d.code === destCode ? ' is-on' : '')}
                style={{ '--tc1': d.theme[0], '--tc2': d.theme[1] }}
                onClick={() => setDestCode(d.code)}>
                {d.flagImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pi-flag-img" src={`/logos/${d.flagImg}`} alt="" />
                ) : (<span className="pi-flag">{d.flag}</span>)}{' '}
                {d.name} <span className="pi-tab-n">{d.institutions.length}</span>
                {d.popular && <span className="pi-pop-tag"><i className="bi bi-fire" /> Most popular</span>}
              </button>
            ))}
          </div>

          <div className="pi-smartbar">
            <span className="pi-dim small"><i className="bi bi-funnel" /> Smart filters</span>
            {SMART.map((s) => (
              <button key={s.key} type="button" title={s.title || s.label}
                className={'pi-tool' + (s.hot ? ' pi-tool-hot' : '') + (smart.includes(s.key) ? ' is-on' : '')}
                onClick={() => toggleSmart(s.key)}>
                <i className={`bi ${s.icon}`} /> {s.label}
              </button>
            ))}
            {(smart.length > 0 || filter !== 'all') && (
              <button type="button" className="pi-tool" onClick={() => { setSmart([]); setFilter('all'); }}>
                <i className="bi bi-x-lg" /> Clear
              </button>
            )}
            <span className="pi-dim small" style={{ marginLeft: 'auto' }}>
              {visibleInsts.length} of {dest.institutions.length} institutions
            </span>
          </div>

          <div className="pi-grid">
            {visibleInsts.map((inst) => {
              const shown = inst.programs.filter(matches).length;
              return (
                <div key={inst.id} className="pi-inst" role="button" tabIndex={0}
                  onClick={(e) => {
                    if (e.target.closest('[data-comm]') || e.target.closest('.pi-contact')) return;
                    setOpenInst(inst); setSort('tf'); setDir(-1);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOpenInst(inst); }}>
                  <div className="pi-inst-top">
                    <Logo inst={inst} />
                    {dest.code === 'uk' && inst.contact && (
                      <span className="pi-contact">
                        <i className="bi bi-telephone-fill" />
                        <a className="pi-contact-num" href={`tel:${inst.contact.replace(/[^+0-9]/g, '')}`}>{inst.contact}</a>
                      </span>
                    )}
                  </div>
                  <div className="pi-inst-title"><strong>{inst.name}</strong></div>
                  <div className="pi-dim">{inst.campus} · {inst.city}</div>

                  {inst.commission && (
                    <div className={'pi-comm pi-comm-mini' + (inst.hasBonus ? ' has-bonus' : '')}
                      data-comm={inst.id} role="button" tabIndex={0} title="See commission details"
                      onClick={(e) => { e.stopPropagation(); setCommInst(inst); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setCommInst(inst); } }}>
                      <i className="bi bi-cash-coin" /> Commission <b>{inst.commission}</b>
                      {inst.hasBonus && <span className="pi-bonus-tag"><i className="bi bi-stars" />BONUS</span>}
                    </div>
                  )}

                  {inst.bestFor && <span className="pi-best"><i className="bi bi-bullseye" /> {inst.bestFor}</span>}
                  {immediateCount(inst) > 0 && (
                    <span className={'pi-inst-now' + (onshoreCount(inst) > 0 ? ' is-onshore' : '')}>
                      <i className="bi bi-broadcast" />
                      {immediateCount(inst)} programme{immediateCount(inst) === 1 ? '' : 's'} with immediate intake
                      {onshoreCount(inst) > 0 ? ` · ${onshoreCount(inst)} onshore` : ''}
                    </span>
                  )}
                  <div className="pi-inst-foot">
                    <span className="pi-chip-type">{inst.type}</span>
                    <span className="pi-dim small">
                      {shown}{shown !== inst.programs.length ? ` of ${inst.programs.length}` : ''} programs{' '}
                      <i className="bi bi-arrow-right-circle-fill" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {visibleInsts.length === 0 && (
            <div className="pi-empty">
              <i className="bi bi-binoculars" />
              <p>No institution has a programme matching these filters.</p>
            </div>
          )}
        </main>
      </div>

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
                  <button key={k} type="button" className={'pi-tool' + (filter === k ? ' is-on' : '')} onClick={() => setFilter(k)}>{label}</button>
                ))}
              </div>
              <div className="pi-toolbar-group" role="group" aria-label="Sort">
                <span className="pi-dim small"><i className="bi bi-sort-down-alt" /> Sort by</span>
                <button type="button" className={'pi-tool' + (sort === 'tf' ? ' is-on' : '')}
                  onClick={() => { if (sort === 'tf') setDir(-dir); setSort('tf'); }}>
                  Tuition fee <i className={`bi bi-arrow-${dir === -1 ? 'down' : 'up'}-short`} />
                </button>
                <button type="button" className={'pi-tool' + (sort === 'tat' ? ' is-on' : '')} onClick={() => setSort('tat')}>
                  Offer speed <i className="bi bi-arrow-up-short" />
                </button>
              </div>
            </div>

            <div className="pi-modal-body">
              {programs.map((prog) => {
                const key = `${openInst.id}::${prog.name}`;
                return (
                  <div className="pi-prog" key={prog.id}>
                    <div className="pi-prog-title">
                      <a className="pi-prog-link" href={`/program/${prog.id}`} target="_blank" rel="noopener noreferrer">
                        <strong>{prog.name}</strong>
                        <i className="bi bi-box-arrow-up-right" />
                      </a>
                      <IntakeFlash prog={prog} />
                    </div>
                    <div className="pi-prog-meta">
                      <span><i className="bi bi-mortarboard" />{prog.level}</span>
                      {prog.duration && <span><i className="bi bi-hourglass-split" />{prog.duration}</span>}
                      <IntakeChips prog={prog} />
                      {prog.tuition && <span><i className="bi bi-cash-stack" />{prog.tuition}</span>}
                      {prog.applicationFee && <span><i className="bi bi-receipt" />App fee {prog.applicationFee}</span>}
                      {prog.offerTat && <span><i className="bi bi-stopwatch" />Offer TAT {prog.offerTat}</span>}
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
                      </div>
                    )}

                    {prog.features.length > 0 && (
                      <div className="pi-usps">
                        {prog.features.filter((f) => features[f]).map((f) => (
                          <span className="pi-usp" key={f}><i className={`bi ${features[f].icon}`} />{features[f].label}</span>
                        ))}
                      </div>
                    )}

                    <div className="pi-prog-ctas">
                      <button type="button" className={'pi-btn pi-btn-ghost' + (shortlist.includes(key) ? ' is-active' : '')}
                        onClick={() => toggleShortlist(key)}>
                        <i className="bi bi-bookmark-heart" /> <span>{shortlist.includes(key) ? 'Shortlisted' : 'Shortlist'}</span>
                      </button>
                      <a className="pi-btn pi-btn-ghost" href={`/program/${prog.id}`} target="_blank" rel="noopener noreferrer">
                        <i className="bi bi-clipboard-check" /> See details
                      </a>
                      <a className="pi-btn pi-btn-primary" href={portalUrl(openInst)} target="_blank" rel="noopener noreferrer">
                        <i className="bi bi-send-fill" /> Apply now
                      </a>
                    </div>
                  </div>
                );
              })}
              {programs.length === 0 && (
                <p className="pi-dim" style={{ textAlign: 'center', padding: '1rem' }}>
                  No programme matches the current filters.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
