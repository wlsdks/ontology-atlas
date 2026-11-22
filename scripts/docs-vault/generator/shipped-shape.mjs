// What the build ships from a scanned manifest: the gateway changelog cut, the
// headings split out of the bundled manifest, and the moved-slug aliases.

/**
 * Keeps the first `limit` `## ` sections. Must match `trimToRecentSections` in
 * `src/views/gateway-doc/lib/vault-doc.ts` (the screen trims once more, so differing boundaries make
 * the fold count a lie); `tests/contract/vault-data/bundled-vault-budget.contract.test.ts` proves it.
 */
export function trimToRecentSections(markdown, limit) {
  const lines = markdown.split('\n');
  const boundaries = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    else if (!inFence && /^## (?!#)/.test(line)) boundaries.push(i);
  }

  if (boundaries.length <= limit) return { body: markdown, omittedSections: 0 };

  const cutAt = boundaries[limit];
  return {
    body: lines.slice(0, cutAt).join('\n').trimEnd(),
    omittedSections: boundaries.length - limit,
  };
}

/**
 * Splits headings out of the bundled manifest: the manifest's docs get
 * `headings: []` and the removed headings come back as a slug → headings map.
 * Empty arrays are omitted from the map — they cost bytes and carry no
 * information.
 */
export function splitManifestHeadings(manifest) {
  const headingsBySlug = {};
  const docs = manifest.docs.map((doc) => {
    if (Array.isArray(doc.headings) && doc.headings.length > 0) {
      headingsBySlug[doc.slug] = doc.headings;
    }
    return { ...doc, headings: [] };
  });
  return { manifest: { ...manifest, docs }, headingsBySlug };
}

/**
 * `{ oldSlug: newSlug }` for every document `docs/.moved.json` moved to a slug the
 * app still ships. A `?slug=` deep link, a pin or a recent entry saved before the
 * move keeps opening the document (`resolveDocsVaultSlugAlias`).
 */
export function movedSlugAliases(movedMap, shippedSlugs) {
  const aliases = {};
  for (const [from, to] of Object.entries(movedMap ?? {})) {
    const oldSlug = from.replace(/^docs\//, '').replace(/\.md$/, '');
    const newSlug = to.replace(/^docs\//, '').replace(/\.md$/, '');
    if (shippedSlugs.has(newSlug)) aliases[oldSlug] = newSlug;
  }
  return Object.fromEntries(Object.entries(aliases).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
