import { buildMarkdown } from '../parser.mjs';
import { CONTAINMENT_KEY_FOR_KIND, containmentKeyFor, unwritableSlugIssue } from '../schema.mjs';

import { applyAllOrNothing } from './atomic-writes.mjs';
import { docTitle, loadVaultDocs } from './documents.mjs';
import { GRAPH_ARRAY_KEY_SET, normalizeRelationRefs } from './relation-refs.mjs';
import { slugToPath } from './slug-paths.mjs';

/**
 * Rewrites every frontmatter graph key and body link pointing at `targetSlug`
 * to `nextSlug`, for rename_concept and merge_concepts. Matches like
 * findBacklinks (absolute slug, last segment, path-prefixed tail); a tail is
 * rewritten with the tail of `nextSlug`, so the new name shows in every form.
 *
 * With `dryRun` it previews without writing. `excludeSlugs` skips documents the
 * caller replaces in the same plan. Pass `targetKind` only when the node changes
 * kind (reclassify_concept): an entry in a kind-named list (domains,
 * capabilities, elements) moves to the list for `targetKind` when the
 * referrer's kind keeps one (`containmentKeyFor`, spec §5), else it stays and is
 * listed in `keptInPlace`; then `targetSlug === nextSlug` is a kind change in place.
 *
 * Returns `{ updates: [{ slug, beforeKeys, afterKeys, bodyHit }], totalUpdated, keptInPlace, unwritableReferrers }`.
 */
export function redirectBacklinks(rootPath, targetSlug, nextSlug, options = {}) {
  /**
   * With `deferWrite` it returns the plan without touching disk, so the caller merges its
   * own writes into one all-or-nothing apply (`dryRun` is a preview for the user).
   */
  const { dryRun = false, deferWrite = false, excludeSlugs = [], targetKind = null } = options;
  const excluded = new Set(Array.isArray(excludeSlugs) ? excludeSlugs : []);
  if (typeof targetSlug !== 'string' || !targetSlug) {
    throw new Error('targetSlug is required.');
  }
  if (typeof nextSlug !== 'string' || !nextSlug) {
    throw new Error('nextSlug is required.');
  }
  if (targetSlug === nextSlug && !targetKind) {
    return { updates: [], totalUpdated: 0, plan: [] };
  }
  const renaming = targetSlug !== nextSlug;

  const docs = loadVaultDocs(rootPath);
  const targetTail = targetSlug.split('/').pop();
  const nextTail = nextSlug.split('/').pop();
  const tailMatches = docs
    .map((doc) => doc.slug)
    .filter((slug) => slug.split('/').pop() === targetTail);
  // A bare or suffix tail is rewritten only while it resolves uniquely; with
  // capabilities/foo and elements/foo both present, rewriting "foo" could redirect
  // the wrong concept. Exact canonical refs stay safe.
  const canRewriteTail = tailMatches.length === 1 && tailMatches[0] === targetSlug;

  function rewriteArrayItem(value) {
    if (typeof value !== 'string') return { value, changed: false };
    if (value === targetSlug) return { value: nextSlug, changed: true };
    if (canRewriteTail && value === targetTail) return { value: nextTail, changed: true };
    if (canRewriteTail && value.endsWith(`/${targetTail}`)) {
      const prefix = value.slice(0, value.length - targetTail.length);
      return { value: `${prefix}${nextTail}`, changed: true };
    }
    return { value, changed: false };
  }

  const updates = [];
  const keptInPlace = [];
  const unwritableReferrers = [];
  /** Applied in one go once the loop ends. */
  const plan = [];
  for (const doc of docs) {
    if (doc.slug === targetSlug || excluded.has(doc.slug)) continue;
    const filePath = slugToPath(rootPath, doc.slug);
    const nextFm = { ...doc.frontmatter };
    const beforeKeys = [];
    const afterKeys = [];
    let fmChanged = false;
    // When the rewritten document is the destination (merge scans the survivor),
    // every rewrite would point at itself, so such refs are dropped instead; the
    // removal stays visible in beforeKeys/afterKeys.
    const rewritingSelf = doc.slug === nextSlug;

    // A kind change in place rewrites no address; running this pass would record
    // no-op updates, since `rewriteArrayItem` reports a match as `changed`.
    for (const key of renaming ? Object.keys(nextFm) : []) {
      const value = nextFm[key];
      if (Array.isArray(value)) {
        const before = [...value];
        const rewritten = value.map((v) => rewriteArrayItem(v));
        const after = rewritten
          .filter((r) => !(rewritingSelf && r.changed))
          .map((r) => r.value);
        if (before.length !== after.length || before.some((b, i) => b !== after[i])) {
          const deduped = normalizeRelationRefs(after);
          nextFm[key] = deduped;
          beforeKeys.push({ key, before });
          // An emptied array is reported with `after` omitted, the removal shape.
          afterKeys.push(deduped.length > 0 ? { key, after: deduped } : { key });
          fmChanged = true;
        }
      } else if (typeof value === 'string') {
        // Only reference slots are rewritten (`domain:` and GRAPH_ARRAY_KEYS). An
        // evidence string such as `path:` is not a reference, and the tail-suffix
        // clause would otherwise point it at a file that does not exist.
        const isRefSlot = key === 'domain' || GRAPH_ARRAY_KEY_SET.has(key);
        const r = isRefSlot ? rewriteArrayItem(value) : { changed: false };
        if (r.changed) {
          if (rewritingSelf) {
            delete nextFm[key];
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key });
          } else {
            nextFm[key] = r.value;
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key, after: r.value });
          }
          fmChanged = true;
        }
      } else if (value && typeof value === 'object') {
        // An object map's keys (`relation_notes: {ref: "why"}`) are rename targets too,
        // or the rationale is orphaned. On a collision the existing new-key value wins
        // (the more recent intent; overwriting it is silent loss) and the displaced old
        // value stays in beforeKeys.
        const entries = Object.entries(value);
        let mapChanged = false;
        const nextMap = {};
        for (const [mapKey, mapValue] of entries) {
          const r = rewriteArrayItem(mapKey);
          if (!r.changed) {
            if (!(mapKey in nextMap)) nextMap[mapKey] = mapValue;
            continue;
          }
          mapChanged = true;
          // A note keyed to the document itself goes with the self-ref it annotated.
          if (rewritingSelf) continue;
          if (r.value in nextMap || entries.some(([k]) => k === r.value)) {
            continue;
          }
          nextMap[r.value] = mapValue;
        }
        if (mapChanged) {
          for (const [mapKey, mapValue] of entries) {
            if (!(mapKey in nextMap) && !rewriteArrayItem(mapKey).changed) nextMap[mapKey] = mapValue;
          }
          beforeKeys.push({ key, before: value });
          if (Object.keys(nextMap).length > 0) {
            afterKeys.push({ key, after: nextMap });
            nextFm[key] = nextMap;
          } else {
            // The last note went with a dropped self-ref: remove the empty map too.
            afterKeys.push({ key });
            delete nextFm[key];
          }
          fmChanged = true;
        }
      }
    }

    /*
     * A kind change moves an entry between kind-named lists, not only its
     * address: `capabilities: [elements/x]` resolves silently and the dense-parent check
     * counts it as a capability. The entry follows the node into its new kind's list
     * when the referrer's kind keeps one (spec §5, `containmentKeyFor`); otherwise
     * it stays and is reported in `keptInPlace`. A merge survivor is skipped.
     */
    if (targetKind && !rewritingSelf) {
      const holderKind = typeof doc.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
      const destination = containmentKeyFor(holderKind, targetKind);
      const namesTarget = (value) => typeof value === 'string' && rewriteArrayItem(value).changed;
      const recordKeyChange = (key, after) => {
        if (!beforeKeys.some((row) => row.key === key)) {
          const before = doc.frontmatter[key];
          beforeKeys.push(Array.isArray(before) && before.length > 0 ? { key, before: [...before] } : { key });
        }
        const row = after.length > 0 ? { key, after } : { key };
        const index = afterKeys.findIndex((existing) => existing.key === key);
        if (index === -1) afterKeys.push(row);
        else afterKeys[index] = row;
      };
      for (const key of Object.values(CONTAINMENT_KEY_FOR_KIND)) {
        const written = doc.frontmatter[key];
        if (!Array.isArray(written)) continue;
        const hits = [...new Set(written.filter(namesTarget).map((value) => rewriteArrayItem(value).value))];
        if (hits.length === 0 || destination === key) continue;
        // A destination written as a non-list cannot take the entry without losing
        // what it holds, so it is kept like a missing list.
        const destinationWritten = destination ? doc.frontmatter[destination] : undefined;
        if (!destination || (destinationWritten !== undefined && !Array.isArray(destinationWritten))) {
          for (const ref of hits) {
            keptInPlace.push({ slug: doc.slug, title: docTitle(doc), key, ref, holderKind });
          }
          continue;
        }
        const source = Array.isArray(nextFm[key]) ? nextFm[key] : [];
        const target = Array.isArray(nextFm[destination]) ? nextFm[destination] : [];
        const alreadyListed = (destinationWritten ?? []).some(namesTarget);
        const nextSource = normalizeRelationRefs(source.filter((value) => !hits.includes(value)));
        const nextTarget = normalizeRelationRefs(alreadyListed ? target : [...target, ...hits]);
        recordKeyChange(key, nextSource);
        recordKeyChange(destination, nextTarget);
        nextFm[key] = nextSource;
        nextFm[destination] = nextTarget;
        fmChanged = true;
      }
      // A `domain:` parent that is no longer a domain has no list to move to at all.
      const parent = doc.frontmatter.domain;
      if (targetKind !== 'domain' && namesTarget(parent)) {
        keptInPlace.push({
          slug: doc.slug,
          title: docTitle(doc),
          key: 'domain',
          ref: rewriteArrayItem(parent).value,
          holderKind,
        });
      }
    }

    let nextBody = doc.body;
    let bodyChanged = false;
    /*
     * Body links take more shapes than frontmatter: the wikilinks for a slug,
     * a heading and an alias (`[[slug]]`, `[[slug#h]]`, `[[slug|alias]]`) and the
     * markdown links (`(slug.md)`, `(slug.md#a)`, `(…/slug.md)`). Missing one
     * leaves it dangling, permanently after a merge deletes the old file. All
     * route through `rewriteArrayItem` for its tail rules and ambiguity guard.
     * Bare prose paths are evidence, not references; a kind change in place
     * leaves the body.
     */
    if (renaming) {
      nextBody = nextBody.replace(
        /\[\[([^\][|#\r\n]+)((?:#[^\][|\r\n]*)?(?:\|[^\][\r\n]*)?)\]\]/g,
        (whole, target, rest) => {
          const r = rewriteArrayItem(target.trim());
          if (!r.changed) return whole;
          bodyChanged = true;
          return `[[${r.value}${rest}]]`;
        },
      );
      nextBody = nextBody.replace(
        /\(([^()\s]+)\.md(#[^()\s]*)?\)/g,
        (whole, target, anchor) => {
          const r = rewriteArrayItem(target);
          if (!r.changed) return whole;
          bodyChanged = true;
          return `(${r.value}.md${anchor ?? ''})`;
        },
      );
    }

    if (!fmChanged && !bodyChanged) continue;
    if (unwritableSlugIssue(doc.slug) !== null) {
      unwritableReferrers.push(doc.slug);
      continue;
    }

    updates.push({
      slug: doc.slug,
      title: docTitle(doc),
      beforeKeys,
      afterKeys,
      bodyChanged,
    });

    // Planned, not written: a failure on a later file must not leave a half vault.
    plan.push({
      op: 'write',
      path: filePath,
      content: buildMarkdown({ frontmatter: nextFm, body: nextBody, source: doc.raw }),
      // The snapshot may be minutes old; a person's edit since then must not be overwritten.
      expectedMtime: doc.mtime,
      expectedRaw: doc.raw,
    });
  }

  if (!dryRun && !deferWrite) applyAllOrNothing(plan, { requireRevisions: true });

  return {
    updates,
    totalUpdated: updates.length,
    keptInPlace,
    unwritableReferrers,
    ...(deferWrite ? { plan } : {}),
  };
}
