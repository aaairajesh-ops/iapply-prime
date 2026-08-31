// Human-readable, shareable URLs for a single programme.
//
//   /canada/crandall-university/master-of-organizational-management
//    ^dest   ^institution        ^programme
//
// Every institution and programme carries a stable `slug`, and every programme
// a ready-made `path`, so a share link can be exported straight from the
// dataset without recomputing anything. Slugs are derived from the names, so a
// renamed programme gets a new URL — the old `/program/<id>` link still works
// and redirects, and the resolver below also accepts the legacy id.

export const slugify = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[''’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

/** Destination segment: the short code (canada, uk, germany). */
export const destSlug = (dest) => slugify(dest.code || dest.name);

/** Institution segment: the institution's name, e.g. "crandall-university". */
export const instSlug = (inst) => inst.slug || slugify(inst.name);

/** Programme segment: the programme name on its own (no institution prefix). */
export const progSlug = (prog, inst) => {
  if (prog.slug) return prog.slug;
  const fromName = slugify(prog.name);
  if (fromName) return fromName;
  // last resort: the id with the institution prefix stripped
  return String(prog.id || '').replace(new RegExp('^' + (inst?.id || '') + '-'), '');
};

export const programmePath = (dest, inst, prog) =>
  `/${destSlug(dest)}/${instSlug(inst)}/${progSlug(prog, inst)}`;

/** Absolute share link. `origin` comes from the request or window at call time. */
export const shareUrl = (origin, path) => `${String(origin || '').replace(/\/$/, '')}${path}`;

/**
 * Add `slug` to every institution and `slug` + `path` to every programme,
 * de-duplicating within an institution. Idempotent: existing values are kept,
 * so a slug that has already been shared never silently changes.
 */
export function ensureSlugs(data) {
  if (!data || !Array.isArray(data.destinations)) return data;
  const usedInst = new Set();
  return {
    ...data,
    destinations: data.destinations.map((dest) => {
      const ds = destSlug(dest);
      return {
        ...dest,
        slug: dest.slug || ds,
        institutions: dest.institutions.map((inst) => {
          let is = instSlug(inst);
          if (!inst.slug) {
            // two institutions sharing a name are told apart by their campus
            let candidate = is;
            if (usedInst.has(`${ds}/${candidate}`)) candidate = slugify(`${inst.name} ${inst.campus || ''}`);
            let n = 2;
            while (usedInst.has(`${ds}/${candidate}`)) candidate = `${is}-${n++}`;
            is = candidate;
          }
          usedInst.add(`${ds}/${is}`);
          const usedProg = new Set();
          return {
            ...inst,
            slug: is,
            programs: inst.programs.map((prog) => {
              let ps = progSlug(prog, inst);
              if (!prog.slug) {
                let n = 2;
                const base = ps;
                while (usedProg.has(ps)) ps = `${base}-${n++}`;
              }
              usedProg.add(ps);
              return { ...prog, slug: ps, path: `/${ds}/${is}/${ps}` };
            }),
          };
        }),
      };
    }),
  };
}

/**
 * Resolve a URL back to a programme. Accepts the canonical slugs, the
 * destination's full name ("united-kingdom" as well as "uk"), and the legacy
 * programme id — so nothing that was ever shared stops working.
 */
export function findByPath(data, destSeg, instSeg, progSeg) {
  const d = slugify(destSeg), i = slugify(instSeg), p = slugify(progSeg);
  for (const dest of data.destinations) {
    if (d && d !== slugify(dest.code) && d !== slugify(dest.name) && d !== slugify(dest.slug)) continue;
    for (const inst of dest.institutions) {
      if (i !== slugify(inst.slug || '') && i !== slugify(inst.name) && i !== slugify(inst.id)) continue;
      const prog = inst.programs.find(
        (x) => p === slugify(x.slug || '') || p === slugify(x.name) || p === slugify(x.id)
      );
      if (prog) return { dest, inst, prog };
    }
  }
  return null;
}

/** Resolve a legacy /program/<id> link. */
export function findById(data, id) {
  const key = slugify(id);
  for (const dest of data.destinations)
    for (const inst of dest.institutions) {
      const prog = inst.programs.find((x) => slugify(x.id) === key);
      if (prog) return { dest, inst, prog };
    }
  return null;
}
