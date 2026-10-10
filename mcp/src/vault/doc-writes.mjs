import { mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildMarkdown } from '../parser.mjs';
import { previewDocumentPatch } from '../document-patch.mjs';
import { flatSlugIssue, generateNodeUid, inspectMergedUids, nodeUidIssue } from '../schema.mjs';

import {
  assertCurrentDocSnapshot,
  assertSnapshotMtime,
  writeFileAtomically,
} from './atomic-writes.mjs';
import { loadVaultDocs, readDoc } from './documents.mjs';
import {
  noteGateRemoval,
  noteGateWrite,
  noteParentGrowth,
  runNodeEligibilityGate,
} from './eligibility-gate.mjs';
import { GRAPH_ARRAY_KEY_SET, normalizeRelationRefs } from './relation-refs.mjs';
import { slugToWritePath, suggestSimilarSlugs } from './slug-paths.mjs';

function assertPlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function assertOptionalPlainObject(value, name) {
  if (value === undefined) return;
  assertPlainObject(value, name);
}

function normalizeFrontmatterValue(key, value) {
  if (GRAPH_ARRAY_KEY_SET.has(key) && Array.isArray(value)) {
    return normalizeRelationRefs(value);
  }
  return value;
}

/** Suffix a not-found or duplicate error appends so the agent can act next. */
function notFoundSuffix(rootPath, slug) {
  const suggestions = suggestSimilarSlugs(rootPath, slug);
  const lines = [
    `Use list_concepts() to see all slugs, or find_evidence({title:${JSON.stringify(slug)}}) to search by title.`,
  ];
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

/**
 * The single write point: writeDoc, patchFrontmatter and updateDoc serialize
 * here, so every door inherits the gate. `write-path-gate.test.mjs` fails if a
 * door writes bytes elsewhere.
 */
function commitDoc(
  rootPath,
  slug,
  filePath,
  frontmatter,
  body,
  {
    created = false,
    bodyWritten = false,
    pathWritten = false,
    previousFrontmatter,
    expectedRaw,
    expectedMtime,
    beforeCommit,
    serializedMarkdown,
    repairedKeys = [],
  } = {},
) {
  writeFileAtomically(filePath, serializedMarkdown ?? buildMarkdown({ frontmatter, body, source: expectedRaw, repairedKeys }), {
    expectedRaw,
    expectedAbsent: created,
    conflictSlug: created ? undefined : slug,
    expectedMtime,
    beforeCommit,
  });
  if (created) noteGateWrite(rootPath, slug);
  noteParentGrowth(slug, previousFrontmatter, frontmatter);
  runNodeEligibilityGate(rootPath, slug, frontmatter, { created, body, bodyWritten, pathWritten, previousFrontmatter });
  return filePath;
}

function identityClaims(frontmatter) {
  const primary = typeof frontmatter?.uid === 'string' ? frontmatter.uid : '';
  const merged = Array.isArray(frontmatter?.merged_uids) ? frontmatter.merged_uids : [];
  return [...new Set([primary, ...merged].filter(Boolean))];
}

function assertNodeIdentity(rootPath, slug, frontmatter) {
  const kind = frontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return;
  const uidIssue = nodeUidIssue(frontmatter.uid);
  if (uidIssue) throw new Error(uidIssue);
  const merged = inspectMergedUids(frontmatter.uid, frontmatter.merged_uids);
  if (merged.invalidIssue) throw new Error(merged.invalidIssue);
  if (merged.nonCanonical) {
    throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.slug === slug) continue;
    for (const claimed of identityClaims(doc.frontmatter)) {
      if (!claims.has(claimed)) continue;
      throw new Error(
        `UID collision: ${claimed} already belongs to "${doc.slug}". ` +
          'Create a new node with a fresh UID, or use merge_concepts to absorb an existing identity.',
      );
    }
  }
}

/**
 * A node written by hand (Obsidian, vim, the GitHub editor) has no `uid:`. That
 * is legitimate input, but left alone the compile stops on an identity error and
 * every graph command on the vault fails.
 */
function hasSettledUid(frontmatter) {
  return typeof frontmatter?.uid === 'string' && frontmatter.uid.trim() !== '';
}

/**
 * Immutability covers changing a present uid only; filling an absent one is
 * allowed, or a hand-written node has no repair door (patch, set uid and add
 * all refuse). Taking over another node's identity is still blocked by the
 * collision check in `assertNodeIdentity`.
 */
function assertIdentityPatch(previousFrontmatter, patch) {
  if (!patch) return;
  if ('uid' in patch && patch.uid !== undefined && patch.uid !== previousFrontmatter.uid) {
    if (hasSettledUid(previousFrontmatter)) {
      throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
    }
  }
  if ('uid' in patch && patch.uid === null && hasSettledUid(previousFrontmatter)) {
    throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if ('merged_uids' in patch) {
    throw new Error('`merged_uids:` is merge_concepts-owned identity history and cannot be edited by a generic patch.');
  }
}

/**
 * The first write to a node without identity mints it (writer-minted UUIDv4).
 * The minted value rides the return so the caller tells the person.
 */
function fillMissingUid(previousFrontmatter, nextFrontmatter) {
  const kind = nextFrontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return null;
  if (hasSettledUid(previousFrontmatter)) return null;
  if (hasSettledUid(nextFrontmatter)) return nextFrontmatter.uid;
  const minted = generateNodeUid();
  nextFrontmatter.uid = minted;
  return minted;
}

/** Writes a new doc, creating directories; throws if it exists, so an overwrite is always explicit. */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToWritePath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(
      `Doc already exists at "${slug}". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add: that loses backlinks.`,
    );
  }
  assertPlainObject(frontmatter, 'frontmatter');
  if (typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // Slug flatness is shape validity, so a hard error; the gate's "never block"
  // covers judgements of meaning only.
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  return commitDoc(rootPath, slug, filePath, frontmatter, body, { created: true });
}


/**
 * Deletes a doc; confirmation and backlink checks are the caller's. Returns the
 * state read just before the delete, throws when absent, honours `expectedMtime`.
 */
export function deleteDoc(rootPath, slug, options = {}) {
  const filePath = slugToWritePath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  const captured = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, options.expectedMtime, captured.mtime);
  options.beforeDelete?.();
  assertCurrentDocSnapshot(slug, filePath, captured.raw, captured.mtime);
  unlinkSync(filePath);
  noteGateRemoval();
  return { ...captured, filePath };
}

/**
 * Patches only the frontmatter, keeping the body: `null` deletes a
 * key, `undefined` skips it. `mintedUid` is set only when this write minted the
 * identity, and the caller must tell the person.
 */
export function patchFrontmatter(rootPath, slug, patch, options = {}) {
  const filePath = slugToWritePath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertPlainObject(patch, 'frontmatter');
  const doc = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, options.expectedMtime, doc.mtime);
  const { frontmatter, body } = doc;
  assertIdentityPatch(frontmatter, patch);
  const next = { ...frontmatter };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = normalizeFrontmatterValue(key, value);
    }
  }
  const mintedUid = fillMissingUid(frontmatter, next);
  assertNodeIdentity(rootPath, slug, next);
  commitDoc(rootPath, slug, filePath, next, body, {
    repairedKeys: Object.keys(patch).filter((key) => patch[key] !== undefined),
    pathWritten: Object.hasOwn(patch, 'path'),
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit: options.beforeCommit,
  });
  return { filePath, frontmatter: next, mintedUid };
}

/**
 * Updates frontmatter and body together, with patchFrontmatter's patch semantics
 * and return shape; a string `body` replaces, `undefined` keeps.
 */
export function updateDoc(rootPath, slug, {
  frontmatter: patch,
  body,
  expectedMtime,
  beforeCommit,
}) {
  const filePath = slugToWritePath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertOptionalPlainObject(patch, 'frontmatter');
  const doc = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, expectedMtime, doc.mtime);
  const { frontmatter } = doc;
  assertIdentityPatch(frontmatter, patch);
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  const identityDraft = { ...frontmatter };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === null) delete identityDraft[key];
    else if (value !== undefined) identityDraft[key] = value;
  }
  const mintedUid = fillMissingUid(frontmatter, identityDraft);
  const preview = previewDocumentPatch({ rawBefore: doc.raw, frontmatterPatch: patch, body, ...(mintedUid ? { mintedUid } : {}) });
  if (preview.status !== 'available') throw new Error('The writer could not resolve the document identity required for this patch.');
  assertNodeIdentity(rootPath, slug, preview.frontmatter);
  commitDoc(rootPath, slug, filePath, preview.frontmatter, preview.body, {
    bodyWritten: body !== undefined,
    pathWritten: Boolean(patch) && Object.hasOwn(patch, 'path'),
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit,
    serializedMarkdown: preview.markdown,
  });
  return { filePath, frontmatter: preview.frontmatter, mintedUid };
}
