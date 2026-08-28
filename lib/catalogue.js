// Reads the public iApply Program Explorer catalogue (no login needed).
//
// Two endpoints back the explorer's "Search Program" page:
//   POST /university-list-data.php   -> institution header + first 3 programme cards
//   POST /program-data.php?...&tolalcnt=N&type_load=moreprogram -> the remaining cards
//
// Every card carries the programme's NEXT intake together with its status
// ("Open", "Open (Onshore Only)", "Closed") in the tooltip of the intake span.
// This module is plain ESM with no dependencies so the same code can be run
// from the sync route on Vercel and from a browser console for checking.

export const IAPPLY_ORIGIN = 'https://iapply.io';

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Catalogue ids for the prime institutions: [countryId, universityId, source?].
// source 'portal' = only listed in the logged-in agent portal (needs
// IAPPLY_PORTAL_COOKIE on the server); default = public Program Explorer.
export const UNI = {
  nbcc: [1, 170], centennial: [1, 2], norquest: [1, 95], durham: [1, 106], humber: [1, 1],
  'alexander-burnaby': [1, 146], crandall: [1, 410], langara: [1, 188], sheridan: [1, 123],
  laurier: [1, 69], dalhousie: [1, 187], ucw: [1, 224], uottawa: [1, 460], capilano: [1, 162],
  'niagara-college': [1, 118], lethbridge: [1, 70],
  hertfordshire: [5, 716], 'uwe-bristol': [5, 729], brighton: [5, 1567],
  sunderland: [5, 1337], 'qmu-edinburgh': [5, 1602], bedfordshire: [5, 712],
  'fhm-berlin': [9, 2716, 'portal'],
};

// Catalogue badge text -> feature key used by the app.
export const BADGE_TO_FEATURE = {
  'express offer': 'express_offer',
  'scholarship available': 'scholarship',
  'low tuition fee': 'low_tuition',
  'backlogs allowed': 'backlogs_allowed',
  'gap allowed': 'gap_allowed',
  'study gap allowed': 'gap_allowed',
  'high ranked': 'high_ranked',
  'app fee waiver': 'app_fee_waiver',
  'application fee waiver': 'app_fee_waiver',
  'direct tie-up': 'direct_tieup',
  'high acceptance rate': 'high_acceptance',
  'moi available': 'moi_available',
  'english language proficency waiver': 'elp_waiver',
  'english language proficiency waiver': 'elp_waiver',
  'no aps required': 'no_aps',
  'no aps required - germany': 'no_aps',
  'easy interview': 'easy_interview',
  'intake open': 'intake_open',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const clean = (s) =>
  (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&rsquo;/g, '’')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** "May 2027" -> { month: 5, year: 2027, label: "May 2027" } (or null). */
export function parseIntakeLabel(text) {
  const m = clean(text).match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (!m) return null;
  const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  return { month: idx + 1, year: Number(m[2]), label: `${MONTHS[idx]} ${m[2]}` };
}

/** Normalise the catalogue's status text. */
export function normaliseStatus(text) {
  const t = clean(text).toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('onshore')) return 'Open (Onshore Only)';
  if (t.startsWith('open')) return 'Open';
  if (t.startsWith('clos')) return 'Closed';
  return clean(text);
}

/** Parse one programme card's HTML. Returns null when it is not a card. */
export function parseCard(rawCard) {
  // The portal leaves unused badges / closed intakes inside HTML comments —
  // strip them so we never read something the catalogue does not display.
  const card = rawCard.replace(/<!--[\s\S]*?-->/g, '');
  const name = card.match(/card-title[^>]*>([\s\S]*?)<\/div>/);
  if (!name) return null;
  // Public catalogue: one card-subtitle (the level). Agent portal: two — the
  // institution name first, then the level — so take the last one.
  const subtitles = [...card.matchAll(/card-subtitle[^>]*>([\s\S]*?)<\/div>/g)].map((m) => clean(m[1]));
  const level = subtitles.length ? [subtitles[subtitles.length - 1]] : null;
  const pid = card.match(/programDetail\((\d+)\)/) || card.match(/id="prgm_(\d+)/);
  // An info row is `<span ...>Label<span> *</span></span> <strong>value</strong>`.
  // Anchor on the label's own <span> so badge text such as "Low Tuition Fee"
  // or a preceding "QS Ranking" row can never be mistaken for the value.
  // The label span may contain <br> / "(Annual)" / a "*" span; the value may be
  // wrapped in an extra <span class="info-item-detail"> before the <strong>.
  const row = (label) => {
    const re = new RegExp(
      '<span[^>]*>\\s*' + label + '(?:[^<]|<br\\s*/?>|<span[^>]*>[^<]*<\\/span>)*?<\\/span>\\s*(?:<span[^>]*>\\s*)*<strong>([\\s\\S]*?)<\\/strong>',
      'i'
    );
    const m = card.match(re);
    return m ? clean(m[1]) : null;
  };
  let tuition = row('Tuition Fee');
  // The public catalogue prints "CAD 26,880 / year"; the agent portal prints the
  // same annual figure without the suffix. Normalise so both compare equal.
  if (tuition && /\d/.test(tuition) && !/\/\s*year/i.test(tuition)) tuition += ' / year';
  const appFee = row('Application Fee');
  const duration = row('Duration');
  const tat = row('Offer Letter TAT');

  // Intakes: every <span class='intake_cls' ... title='STATUS'>Mon YYYY</span>
  const intakes = [];
  for (const m of card.matchAll(/intake_cls[^>]*?title=['"]([^'"]*)['"][^>]*>([\s\S]*?)<\/span>/g)) {
    const parsed = parseIntakeLabel(m[2]);
    if (parsed) intakes.push({ ...parsed, status: normaliseStatus(m[1]) });
  }
  // Fallback for cards that print intakes without the span (older markup)
  if (intakes.length === 0) {
    const iv = card.match(/Intakes<\/span>\s*(?:<div[^>]*>)?([\s\S]*?)<\/div>/);
    if (iv) {
      for (const part of clean(iv[1]).split(/,|\//)) {
        const parsed = parseIntakeLabel(part);
        if (parsed) intakes.push({ ...parsed, status: 'unknown' });
      }
    }
  }

  const cardStatus = card.match(/open-badge[^>]*>([^<]+)</);

  const features = [];
  for (const m of card.matchAll(/badge-custom[^>]*>([\s\S]*?)<\/span>/g)) {
    const key = BADGE_TO_FEATURE[clean(m[1]).toLowerCase()];
    if (key && !features.includes(key)) features.push(key);
  }

  const tf = tuition ? Number((tuition.match(/([\d,]+)/) || ['', ''])[1].replace(/,/g, '')) : null;
  const durM = duration ? duration.match(/(\d+)\s*Month/i) : null;
  const tatM = tat ? tat.match(/(\d+)/) : null;

  return {
    portalId: pid ? Number(pid[1]) : null,
    name: clean(name[1]),
    level: level ? level[0] : null,
    tuition: tuition || null,
    tf: Number.isFinite(tf) && tf > 0 ? tf : null,
    applicationFee: appFee || null,
    duration: duration || null,
    durationMonths: durM ? Number(durM[1]) : null,
    offerTat: tat || null,
    offerTatDays: tatM ? Number(tatM[1]) : null,
    intakeList: intakes,
    cardStatus: cardStatus ? normaliseStatus(cardStatus[1]) : null,
    features,
  };
}

/** Parse a whole HTML response (header page or "load more" page). */
export function parsePage(html) {
  const out = { logo: null, total: null, programs: [] };
  const logo = html.match(/logo-circle[\s\S]{0,300}?<img[^>]+src="([^"]+)"/i);
  if (logo) out.logo = logo[1];
  const total = html.match(/You have <b>(\d+)<\/b>/);
  if (total) out.total = Number(total[1]);
  for (const chunk of html.split('card-custom').slice(1)) {
    const p = parseCard(chunk);
    if (p) out.programs.push(p);
  }
  return out;
}

const form = (obj) =>
  Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

async function post(path, body, fetchImpl, { portal = false, cookie = '' } = {}) {
  const base = portal ? IAPPLY_ORIGIN + '/outreachs' : IAPPLY_ORIGIN;
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': UA,
    Referer: portal ? base + '/search-program' : IAPPLY_ORIGIN + '/program-explorer',
  };
  if (portal && cookie) headers.Cookie = cookie;
  const res = await fetchImpl(base + path, { method: 'POST', headers, body, cache: 'no-store', redirect: 'manual' });
  const text = await res.text();
  if (portal && (res.status === 302 || /Partner Log ?in|name="password"/i.test(text))) {
    const err = new Error('agent portal session expired — set a fresh IAPPLY_PORTAL_COOKIE');
    err.auth = true;
    throw err;
  }
  if (!res.ok || /403 Forbidden/i.test(text) || text.length < 300) {
    const err = new Error(res.status === 403 || /403/.test(text) ? 'blocked by portal firewall (403)' : `empty response (${res.status})`);
    err.blocked = true;
    throw err;
  }
  return text;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every programme card the catalogue lists for one institution.
 * Two requests: the header page (3 cards) and the "load more" page (the rest).
 */
export async function fetchInstitution(cId, uId, { fetchImpl = fetch, pace = 1500, portal = false, cookie = process.env.IAPPLY_PORTAL_COOKIE || '' } = {}) {
  if (portal && !cookie) {
    const err = new Error('listed only in the agent portal — set IAPPLY_PORTAL_COOKIE to sync it');
    err.auth = true;
    throw err;
  }
  const opts = { portal, cookie };
  const filters = JSON.stringify({ c_id: String(cId), u_id: uId });
  const first = await post('/university-list-data.php?v=1', form({ data_filters: filters }), fetchImpl, opts);
  const page = parsePage(first);
  const remaining = page.total ? page.total - page.programs.length : 0;
  if (remaining > 0) {
    await sleep(pace);
    const more = await post(
      `/program-data.php?v=1&c_id=${cId}&uni_id=${uId}&tolalcnt=${remaining}`,
      form({ data_filters: filters }) + '&type_load=moreprogram',
      fetchImpl,
      opts
    );
    page.programs.push(...parsePage(more).programs);
  }
  page.source = portal ? 'portal' : 'public';
  return page;
}
