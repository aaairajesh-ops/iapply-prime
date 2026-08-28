// Intake helpers shared by the list, the programme page and the sync.
//
// A programme carries `intakeList`: [{ month, year, label, status }] sorted by
// date. `status` is what the catalogue publishes for that intake:
//   "Open" | "Open (Onshore Only)" | "Closed" | "unknown"
// The legacy `intakes` string ("Jan 2027 / May 2027") is kept in step with the
// list so older code and the JSON export keep working.

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** How far ahead (in months, inclusive) an intake still counts as "immediate". */
export const IMMEDIATE_WINDOW_MONTHS = 3;

export const isOnshore = (status) => /onshore/i.test(status || '');
export const isOpenStatus = (status) => /^open/i.test(status || '');

/** Month index (year*12 + month-1) so intakes can be compared as integers. */
export const monthIndex = (year, month) => year * 12 + (month - 1);

export function parseLabel(text) {
  const m = String(text || '').trim().match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/);
  if (!m) return null;
  const idx = MONTHS.findIndex((x) => x.toLowerCase() === m[1].slice(0, 3).toLowerCase());
  if (idx < 0) return null;
  return { month: idx + 1, year: Number(m[2]), label: `${MONTHS[idx]} ${m[2]}` };
}

/** Build a list from the legacy "Jan 2027 / May 2027" string. */
export function listFromString(str, status = 'unknown') {
  return sortIntakes(
    String(str || '')
      .split(/\s*[\/,]\s*/)
      .map(parseLabel)
      .filter(Boolean)
      .map((x) => ({ ...x, status }))
  );
}

export function sortIntakes(list) {
  const seen = new Set();
  return [...(list || [])]
    .filter((i) => i && i.year && i.month)
    .sort((a, b) => monthIndex(a.year, a.month) - monthIndex(b.year, b.month))
    .filter((i) => (seen.has(i.label) ? false : (seen.add(i.label), true)));
}

export const listToString = (list) => sortIntakes(list).map((i) => i.label).join(' / ');

/**
 * Merge freshly synced intakes (with statuses) into what we already hold.
 * The catalogue card only ever shows the NEXT intake, so earlier-known intakes
 * are kept; a fresh status always wins over a stale one.
 */
export function mergeIntakes(existing, fresh) {
  const byLabel = new Map();
  for (const i of sortIntakes(existing)) byLabel.set(i.label, { ...i });
  for (const i of sortIntakes(fresh)) byLabel.set(i.label, { ...(byLabel.get(i.label) || {}), ...i });
  return sortIntakes([...byLabel.values()]);
}

/**
 * Classify a programme's intakes relative to `now`.
 * immediate: current month .. now + IMMEDIATE_WINDOW_MONTHS, not marked Closed
 * onshore:   immediate AND the catalogue says "Open (Onshore Only)"
 * future:    everything later than the window
 */
export function classifyIntakes(intakeList, now = new Date()) {
  const cur = monthIndex(now.getFullYear(), now.getMonth() + 1);
  const list = sortIntakes(intakeList);
  const immediate = list.filter((i) => {
    const idx = monthIndex(i.year, i.month);
    return idx >= cur && idx <= cur + IMMEDIATE_WINDOW_MONTHS && !/^clos/i.test(i.status || '');
  });
  const onshore = immediate.filter((i) => isOnshore(i.status));
  const future = list.filter((i) => monthIndex(i.year, i.month) > cur + IMMEDIATE_WINDOW_MONTHS);
  const past = list.filter((i) => monthIndex(i.year, i.month) < cur);
  return { immediate, onshore, future, past, next: list.find((i) => monthIndex(i.year, i.month) >= cur) || null };
}

/** Text + tone for the flash pill; null when nothing is immediate. */
export function intakeFlash(intakeList, now = new Date()) {
  const { immediate, onshore } = classifyIntakes(intakeList, now);
  if (immediate.length === 0) return null;
  const labels = immediate.map((i) => i.label).join(', ');
  if (onshore.length > 0) {
    return {
      tone: 'onshore',
      title: 'Intake open now — best for onshore students',
      detail: `${onshore.map((i) => i.label).join(', ')} · onshore`,
    };
  }
  return { tone: 'open', title: 'Intake open now', detail: labels };
}

/** Ensure a programme object has both intakeList and the legacy string. */
export function normaliseProgramIntakes(prog) {
  const list = prog.intakeList && prog.intakeList.length ? sortIntakes(prog.intakeList) : listFromString(prog.intakes);
  return { ...prog, intakeList: list, intakes: listToString(list) };
}
