/**
 * The destructive node lifecycle: `rename_concept`, `reclassify_concept`,
 * `merge_concepts`, `delete_concept` — each a dry-run preview first, then a
 * confirmed write that rewrites every backlink.
 */

import {
  buildMarkdown,
  parseFrontmatter,
} from '../parser.mjs';
import {
  defaultBody,
  flatSlugIssue,
  mergeNodeIdentityHistory,
} from '../schema.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import {
  requireNonBlankString,
  requireOptionalBoolean,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeNumber,
} from '../server/validate.mjs';
import { formatAllowedValueError } from '../suggestions.mjs';
import {
  VaultConflictError,
  applyAllOrNothing,
  canonicalDiskSlug,
  deleteDoc,
  extractSummaryExcerpt,
  findBacklinks,
  readDoc,
  redirectBacklinks,
  slugToPath,
  vaultSlugExists,
} from '../vault.mjs';
import { compactPostWriteMaintenance } from './maintenance.mjs';
import {
  ADD_CONCEPT_KINDS,
  destructivePreviewState,
  missingSlugMessage,
  readDocIfPresent,
  requireNodeNotReservedForHuman,
  resolveExistingVaultSlug,
} from './vault-nodes.mjs';

function publicBacklinkUpdates(result) {
  return {
    updates: result.updates,
    totalUpdated: result.totalUpdated,
  };
}

function renameConcept({ oldSlug, newSlug, confirm = false, overwrite = false, expected_mtime }) {
  requireNonBlankString(oldSlug, 'oldSlug');
  requireNonBlankString(newSlug, 'newSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(overwrite, 'overwrite');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (oldSlug === newSlug) {
    throw new Error('oldSlug and newSlug are identical.');
  }
  /*
   * ⚠️ **Names differing only in case are stopped here** (review 2026-08-16 — the
   * document actually disappearing was reproduced).
   *
   * The check above is a string comparison, so it treats `Auth` and `auth` as
   * different. macOS and Windows filesystems treat them as the **same file**, so
   * writing the new name and deleting the old one deleted what had just been
   * written — and this tool returned `ok: true, moved: true`. Measured:
   *
   * ```
   * rename_concept{oldSlug:"Auth", newSlug:"auth", confirm:true, overwrite:true}
   *   → ok:true, moved:true, backlinkUpdates:{totalUpdated:1}
   *   → neither Auth.md nor auth.md left on disk; references left dangling
   * ```
   *
   * The write layer guards it too (`applyAllOrNothing`'s same-file detection), but
   * that alone yields a **half-finished rename**: references point at the new name
   * while the filename on disk does not change. Half-finished is not success — say
   * plainly that it cannot be done here, and name the path that works.
   */
  if (oldSlug.toLowerCase() === newSlug.toLowerCase()) {
    throw new Error(
      `oldSlug and newSlug differ only in letter case ("${oldSlug}" → "${newSlug}"). ` +
        'On macOS and Windows those are the same file, so this rename would delete the ' +
        'document instead of renaming it. Rename through a different name first ' +
        `(for example "${newSlug}-tmp"), then to "${newSlug}".`,
    );
  }
  // Resolve the caller's spelling to the on-disk one before anything else. A
  // wrong-case oldSlug passes `existsSync` on macOS/Windows while every backlink
  // match below is case-sensitive — reproduced: rename deleted the document,
  // redirected 0 backlinks, and reported success (bug sweep 2026-09-01).
  const diskOldSlug = canonicalDiskSlug(VAULT_ROOT, oldSlug);
  if (!diskOldSlug) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', oldSlug));
  }
  requireNodeNotReservedForHuman(readDocIfPresent(diskOldSlug), 'rename_concept');
  const canonicalTarget = canonicalDiskSlug(VAULT_ROOT, newSlug);
  if (canonicalTarget && canonicalTarget !== newSlug) {
    throw new Error(
      `Target slug "${newSlug}" collides with existing "${canonicalTarget}" — the names ` +
        'differ only in letter case, which is the same file on macOS and Windows. ' +
        'Choose a different name or rename that document out of the way first.',
    );
  }
  const targetExists = vaultSlugExists(VAULT_ROOT, newSlug);
  if (!overwrite && targetExists) {
    throw new Error(
      `Target slug already exists: "${newSlug}". Pass overwrite: true to replace it.`,
    );
  }
  // **The destination is a write too** (Codex review, 2026-09-02). Guarding only
  // the source left `overwrite: true` as a door: the reserved document at the
  // destination was read, then replaced with the source's bytes, and its
  // reservation went with it. A refusal that covers the operand but not the
  // casualty is not a refusal.
  if (targetExists) {
    requireNodeNotReservedForHuman(readDocIfPresent(newSlug), 'rename_concept');
  }

  const sourcePath = slugToPath(VAULT_ROOT, diskOldSlug);
  const targetPath = slugToPath(VAULT_ROOT, newSlug);
  const sourceDoc = readDoc(VAULT_ROOT, sourcePath);
  const targetDoc = overwrite && targetExists ? readDoc(VAULT_ROOT, targetPath) : null;

  // Slug flatness — rename writes directly rather than through writeDoc, so the
  // same gate is applied here (closing the door on path-shaped identity returning
  // through rename).
  const renameSlugIssue = flatSlugIssue(sourceDoc.frontmatter?.kind, newSlug);
  if (renameSlugIssue) throw new Error(renameSlugIssue);

  // Source mtime conflict guard — compare against `expected` right after the read.
  if (typeof expected_mtime === 'number' && sourceDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(diskOldSlug, expected_mtime, sourceDoc.mtime);
  }

  // Step 1 — dry-run preview of every backlink rewrite.
  // An overwrite target is about to be replaced wholesale by the source document.
  // Planning backlink rewrites for that stale target inverts the order: right
  // after the source is written, the stale target overwrites it again.
  const replacedSlugs = overwrite ? [newSlug] : [];
  const preview = redirectBacklinks(VAULT_ROOT, diskOldSlug, newSlug, {
    dryRun: true,
    excludeSlugs: replacedSlugs,
  });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({ dryRun: true, wouldChange: true }),
      uid: sourceDoc.frontmatter.uid,
      oldSlug: diskOldSlug,
      newSlug,
      sourcePath,
      targetPath,
      moved: false,
      backlinkUpdates: publicBacklinkUpdates(preview),
      message: `dry-run — pass confirm:true to actually move the file and redirect ${preview.totalUpdated} backlinks.`,
    };
  }

  /**
   * Step 2 — **three steps bound into one plan, applied all-or-nothing.**
   *
   * It used to write each step immediately in order: create the new file, rewrite
   * backlinks, delete the old file. The comment claimed *"partial failure doesn't
   * lose data"*, which was true (no data is lost) — but **the graph split**.
   * Measured 2026-08-01: with one of three references read-only, two nodes with
   * the same title remained and the references forked across both names. And
   * `validate` and `health` both called that vault clean. The tool description's
   * promise of "one atomic graph-level operation" was false.
   *
   * Now only the plan is built (`deferWrite`) and applied once at the end. On
   * failure it rolls back — as long as the process lives, the vault is as it started.
   */
  const nextFrontmatter = { ...sourceDoc.frontmatter };
  // Update `slug:` only when it mirrors the file slug. A differing value is a
  // user-facing alias (the dogfood vault's `project.md` carries
  // `slug: ontology-atlas`) that other documents reference by that spelling;
  // overwriting it with newSlug severed every alias-form ref while
  // backlinkUpdates reported nothing (bug sweep 2026-09-01).
  if (typeof nextFrontmatter.slug === 'string' && nextFrontmatter.slug.trim() === diskOldSlug) {
    nextFrontmatter.slug = newSlug;
  }
  const result = redirectBacklinks(VAULT_ROOT, diskOldSlug, newSlug, {
    dryRun: false,
    deferWrite: true,
    excludeSlugs: replacedSlugs,
  });
  applyAllOrNothing([
    {
      op: 'write',
      path: targetPath,
      content: buildMarkdown({ frontmatter: nextFrontmatter, body: sourceDoc.body }),
      ...(targetDoc
        ? { expectedRaw: targetDoc.raw, expectedMtime: targetDoc.mtime }
        : { expectedAbsent: true }),
    },
    ...result.plan,
    // Deletion is last, and the plan preserves that order. Rollback runs in
    // reverse, so the old file is restored before the new one is removed.
    ...(sourcePath !== targetPath
      ? [{
          op: 'delete',
          path: sourcePath,
          expectedRaw: sourceDoc.raw,
          expectedMtime: sourceDoc.mtime,
        }]
      : []),
  ], { requireRevisions: true });

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    uid: sourceDoc.frontmatter.uid,
    oldSlug: diskOldSlug,
    newSlug,
    sourcePath,
    targetPath,
    moved: true,
    backlinkUpdates: publicBacklinkUpdates(result),
    changed: true,
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function looksLikeGeneratedStarter(body, kind) {
  const text = String(body || '');
  if (text.length > 800) return false;
  const markers = {
    project: /One- or two-line summary of this project/i,
    domain: /(?:Describe the stable responsibility or problem boundary|A \*domain\* is a large area of the project)/i,
    capability: /(?:Describe the observable, implementation-independent ability|A \*capability\* is one user-visible feature)/i,
    element: /(?:Describe the distinct implementation role|implementation element)/i,
    document: /(?:State what this narrative or reference artifact explains|source document)/i,
  };
  return Boolean(markers[kind]?.test(text));
}

function reclassifyConcept({ slug, newKind, newSlug, domain, body, confirm = false, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireNonBlankString(newKind, 'newKind');
  if (!ADD_CONCEPT_KINDS.has(newKind)) throw new Error(formatAllowedValueError('newKind', newKind, [...ADD_CONCEPT_KINDS]));
  requireOptionalNonBlankString(newSlug, 'newSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (domain !== undefined && domain !== null) requireNonBlankString(domain, 'domain');
  if (body !== undefined && typeof body !== 'string') throw new Error('body must be a string.');
  if ((newKind === 'capability' || newKind === 'element') && (domain === undefined || domain === null)) {
    throw new Error(`domain is required when reclassifying to kind "${newKind}".`);
  }
  const canonicalOld = resolveExistingVaultSlug(slug);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalOld ?? slug), 'reclassify_concept');
  if (!canonicalOld) throw new Error(missingSlugMessage('Source slug does not exist in vault', slug));
  const canonicalNew = newSlug || canonicalOld;
  if (canonicalNew !== canonicalOld && vaultSlugExists(VAULT_ROOT, canonicalNew)) throw new Error(`Target slug already exists: "${canonicalNew}".`);
  const sourcePath = slugToPath(VAULT_ROOT, canonicalOld);
  const targetPath = slugToPath(VAULT_ROOT, canonicalNew);
  const sourceDoc = readDoc(VAULT_ROOT, sourcePath);
  if (typeof expected_mtime === 'number' && sourceDoc.mtime !== expected_mtime) throw new VaultConflictError(canonicalOld, expected_mtime, sourceDoc.mtime);
  const oldKind = sourceDoc.frontmatter.kind;
  // Slug flatness — reclassify writes directly too, so the new (kind, slug) pair is measured.
  const reclassifySlugIssue = flatSlugIssue(newKind, canonicalNew);
  if (reclassifySlugIssue) throw new Error(reclassifySlugIssue);
  const title = sourceDoc.frontmatter.title || canonicalNew.split('/').pop();
  let nextBody = sourceDoc.body;
  let bodyAction = 'preserved';
  if (body !== undefined) {
    nextBody = body;
    bodyAction = 'replaced_explicitly';
  } else if (looksLikeGeneratedStarter(sourceDoc.body, oldKind)) {
    nextBody = defaultBody(newKind, title);
    bodyAction = 'regenerated_starter';
  }
  const backlinkUpdates = canonicalNew === canonicalOld
    ? { updates: [], totalUpdated: 0 }
    : redirectBacklinks(VAULT_ROOT, canonicalOld, canonicalNew, { dryRun: true });
  const dryRun = !confirm;
  const base = {
    ok: false,
    dryRun,
    changed: false,
    ...destructivePreviewState({ dryRun, wouldChange: true }),
    uid: sourceDoc.frontmatter.uid,
    oldSlug: canonicalOld,
    newSlug: canonicalNew,
    oldKind,
    newKind,
    sourcePath,
    targetPath,
    bodyAction,
    backlinkUpdates: publicBacklinkUpdates(backlinkUpdates),
  };
  if (!confirm) return base;
  const nextFrontmatter = { ...sourceDoc.frontmatter, kind: newKind };
  // Same alias rule as rename_concept: only a `slug:` mirroring the file slug
  // follows the move; a differing value is a referenced user-facing alias.
  if (typeof nextFrontmatter.slug !== 'string' || nextFrontmatter.slug.trim() === canonicalOld) {
    nextFrontmatter.slug = canonicalNew;
  }
  if (domain === null || !['capability', 'element'].includes(newKind)) delete nextFrontmatter.domain;
  else if (domain !== undefined) nextFrontmatter.domain = domain;
  // One plan, for the same reason as rename: this tool also creates a file,
  // rewrites backlinks, and deletes the old file, and stopping midway left a
  // half-vault with a forked kind.
  const appliedBacklinks = canonicalNew === canonicalOld
    ? backlinkUpdates
    : redirectBacklinks(VAULT_ROOT, canonicalOld, canonicalNew, { dryRun: false, deferWrite: true });
  applyAllOrNothing([
    {
      op: 'write',
      path: targetPath,
      content: buildMarkdown({ frontmatter: nextFrontmatter, body: nextBody }),
      ...(sourcePath === targetPath
        ? { expectedRaw: sourceDoc.raw, expectedMtime: sourceDoc.mtime }
        : { expectedAbsent: true }),
    },
    ...(appliedBacklinks.plan ?? []),
    ...(sourcePath !== targetPath
      ? [{
          op: 'delete',
          path: sourcePath,
          expectedRaw: sourceDoc.raw,
          expectedMtime: sourceDoc.mtime,
        }]
      : []),
  ], { requireRevisions: true });
  return {
    ...base,
    ok: true,
    dryRun: false,
    changed: true,
    backlinkUpdates: publicBacklinkUpdates(appliedBacklinks),
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function mergeConcepts({ fromSlug, intoSlug, confirm = false, expected_mtime, expected_into_mtime }) {
  requireNonBlankString(fromSlug, 'fromSlug');
  requireNonBlankString(intoSlug, 'intoSlug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  requireOptionalNonNegativeNumber(expected_into_mtime, 'expected_into_mtime');
  if (fromSlug === intoSlug) {
    throw new Error('fromSlug and intoSlug are identical.');
  }
  // Operate on the disk's spelling, not the caller's — a wrong-case slug passes
  // `existsSync` on macOS/Windows while backlink matching is case-sensitive, so
  // the merge would delete the source and redirect nothing (bug sweep 2026-09-01).
  const diskFromSlug = canonicalDiskSlug(VAULT_ROOT, fromSlug);
  if (!diskFromSlug) {
    throw new Error(missingSlugMessage('fromSlug does not exist in vault', fromSlug));
  }
  requireNodeNotReservedForHuman(readDocIfPresent(diskFromSlug), 'merge_concepts');
  const diskIntoSlug = canonicalDiskSlug(VAULT_ROOT, intoSlug);
  requireNodeNotReservedForHuman(readDocIfPresent(diskIntoSlug), 'merge_concepts');
  if (!diskIntoSlug) {
    throw new Error(missingSlugMessage('intoSlug does not exist in vault', intoSlug));
  }
  if (diskFromSlug === diskIntoSlug) {
    throw new Error(
      `fromSlug and intoSlug name the same document on disk ("${diskFromSlug}") — ` +
        'the spellings differ only in letter case.',
    );
  }
  fromSlug = diskFromSlug;
  intoSlug = diskIntoSlug;

  const fromPath = slugToPath(VAULT_ROOT, fromSlug);
  const fromDoc = readDoc(VAULT_ROOT, fromPath);
  const intoPath = slugToPath(VAULT_ROOT, intoSlug);
  const intoDoc = readDoc(VAULT_ROOT, intoPath);
  const identityHistory = mergeNodeIdentityHistory(fromDoc.frontmatter, intoDoc.frontmatter);
  const absorbedUids = identityHistory.absorbedUids;

  // R11 closeout — fromSlug mtime conflict guard.
  if (typeof expected_mtime === 'number' && fromDoc.mtime !== expected_mtime) {
    throw new VaultConflictError(fromSlug, expected_mtime, fromDoc.mtime);
  }
  if (typeof expected_into_mtime === 'number' && intoDoc.mtime !== expected_into_mtime) {
    throw new VaultConflictError(intoSlug, expected_into_mtime, intoDoc.mtime);
  }

  const preview = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, { dryRun: true });

  if (!confirm) {
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({ dryRun: true, wouldChange: true }),
      fromUid: fromDoc.frontmatter.uid,
      intoUid: intoDoc.frontmatter.uid,
      absorbedUids,
      fromSlug,
      intoSlug,
      fromPath,
      deleted: false,
      backlinkUpdates: publicBacklinkUpdates(preview),
      capturedFrom: {
        frontmatter: fromDoc.frontmatter,
        bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
      },
      message: `dry-run — pass confirm:true to redirect ${preview.totalUpdated} backlinks and then permanently delete ${fromSlug}.md.`,
    };
  }

  // Rewrite plus delete in one plan. Rewrites used to be written per file
  // immediately with the delete separate — if one file failed to write, only some
  // references pointed at the new name and `fromSlug` survived (and both checks
  // reported clean).
  const result = redirectBacklinks(VAULT_ROOT, fromSlug, intoSlug, {
    dryRun: false,
    deferWrite: true,
  });
  const intoPlanIndex = result.plan.findIndex((operation) => operation.path === intoPath);
  const redirectedInto = intoPlanIndex >= 0
    ? parseFrontmatter(result.plan[intoPlanIndex].content)
    : { frontmatter: intoDoc.frontmatter, body: intoDoc.body };
  const intoIdentityWrite = {
    op: 'write',
    path: intoPath,
    expectedRaw: intoDoc.raw,
    expectedMtime: intoDoc.mtime,
    content: buildMarkdown({
      frontmatter: {
        ...redirectedInto.frontmatter,
        uid: identityHistory.survivorUid,
        merged_uids: identityHistory.merged_uids,
      },
      body: redirectedInto.body,
    }),
  };
  if (intoPlanIndex >= 0) result.plan[intoPlanIndex] = intoIdentityWrite;
  else result.plan.push(intoIdentityWrite);
  applyAllOrNothing([
    ...result.plan,
    {
      op: 'delete',
      path: fromPath,
      expectedRaw: fromDoc.raw,
      expectedMtime: fromDoc.mtime,
    },
  ], { requireRevisions: true });

  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    fromUid: fromDoc.frontmatter.uid,
    intoUid: intoDoc.frontmatter.uid,
    absorbedUids,
    fromSlug,
    intoSlug,
    fromPath,
    deleted: true,
    backlinkUpdates: publicBacklinkUpdates(result),
    changed: true,
    capturedFrom: {
      frontmatter: fromDoc.frontmatter,
      body: fromDoc.body,
      bodyExcerpt: extractSummaryExcerpt(fromDoc.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

function deleteConcept({ slug, confirm = false, force = false, expected_mtime }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalBoolean(force, 'force');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  // Existence check, so a dry run never falsely reports "deletable". (deleteDoc
  // throws again at the real delete step, but the dry-run path never reaches
  // deleteDoc, hence the separate check.)
  let filePath = slugToPath(VAULT_ROOT, slug);
  // Resolve to the disk's spelling before the backlink safety check — a
  // wrong-case slug passes `existsSync` on macOS/Windows while `findBacklinks`
  // matches case-sensitively, so a referenced node was deletable without force
  // and without a warning (bug sweep 2026-09-01).
  const diskSlug = canonicalDiskSlug(VAULT_ROOT, slug);
  if (!diskSlug) {
    throw new Error(missingSlugMessage('Doc not found', slug));
  }
  slug = diskSlug;
  filePath = slugToPath(VAULT_ROOT, slug);
  const sourceDoc = readDoc(VAULT_ROOT, filePath);
  requireNodeNotReservedForHuman(sourceDoc, 'delete_concept');
  // Ambiguous-tail referrers included: a doc whose ref merely *could* mean this
  // node still blocks an un-forced delete (bug sweep 2026-09-01).
  const backlinks = findBacklinks(VAULT_ROOT, slug, { includeAmbiguousTailRefs: true });

  if (!confirm) {
    const blockedReasons =
      backlinks.length > 0 && !force
        ? [`${backlinks.length} backlink(s) require force:true before confirmation`]
        : [];
    return {
      ok: false,
      dryRun: true,
      ...destructivePreviewState({
        dryRun: true,
        wouldChange: true,
        blockedReasons,
      }),
      uid: sourceDoc.frontmatter.uid,
      slug,
      filePath,
      backlinks,
      message:
        backlinks.length > 0
          ? `dry-run — ${backlinks.length} backlinks point here, so confirm:true alone is refused. Pass force:true as well to push through.`
          : 'dry-run — pass confirm:true to delete it for real.',
    };
  }

  if (backlinks.length > 0 && !force) {
    throw new Error(
      `Refusing to delete: ${backlinks.length} backlinks point here: ` +
        backlinks.map((b) => b.slug).join(', ') +
        ' — force:true pushes through (the referring nodes are left dangling).',
    );
  }

  const deleted = deleteDoc(VAULT_ROOT, slug, {
    expectedMtime: typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    dryRun: false,
    ...destructivePreviewState({ dryRun: false, wouldChange: false }),
    uid: deleted.frontmatter.uid,
    slug,
    filePath: deleted.filePath ?? filePath,
    forced: backlinks.length > 0 ? true : undefined,
    backlinksAtDelete: backlinks.length > 0 ? backlinks : undefined,
    changed: true,
    captured: {
      frontmatter: deleted.frontmatter,
      body: deleted.body,
      bodyExcerpt: extractSummaryExcerpt(deleted.body, 200),
    },
    postWriteMaintenance: compactPostWriteMaintenance(),
  };
}

export {
  renameConcept,
  reclassifyConcept,
  mergeConcepts,
  deleteConcept,
};
