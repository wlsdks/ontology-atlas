/**
 * Edge writes and the frontmatter keys they land in: `add_relation`,
 * `add_relations`, `remove_relation`, `replace_relation`, with the alias-key
 * resolution that makes one edge one edge however it was authored.
 */

import { structuredRowErrorDetails } from '../server/rpc.mjs';
import { VAULT_ROOT } from '../server/runtime.mjs';
import {
  requireAllowedObjectKeys,
  requireNonBlankString,
  requireOptionalBoolean,
  requireOptionalNonNegativeNumber,
  requirePlainObject,
} from '../server/validate.mjs';
import { formatAllowedValueError } from '../suggestions.mjs';
import {
  VaultConflictError,
  normalizeRelationRefs,
  patchFrontmatter,
  readDoc,
  slugToPath,
} from '../vault.mjs';
import { compactPostWriteMaintenance } from './maintenance.mjs';
import {
  RELATION_KEY,
  RELATION_TYPES,
  matchingRelationNoteKeys,
  relationExists,
  relationKeyPatch,
  relationRefMatches,
  relationRefsFor,
} from './relation-keys.mjs';
import {
  assertGraphNodeEndpoint,
  destructivePreviewState,
  missingSlugMessage,
  readDocIfPresent,
  requireNodeNotReservedForHuman,
  resolveExistingVaultSlug,
} from './vault-nodes.mjs';

function addRelation({ from, to, type, why, expected_mtime }, options = {}) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(type, 'type');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const key = RELATION_KEY[type];
  if (!key) {
    throw new Error(formatAllowedValueError('type', type, RELATION_TYPES));
  }
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'add_relation');
  // Both endpoints are verified to exist in the vault. Without this a dangling
  // reference is silently appended to a frontmatter array when an agent sends a
  // typo or a hallucinated slug; now it surfaces as a clean error. Beyond direct
  // slugs, tail and frontmatter slug aliases are stored as the canonical slug.
  if (!canonicalFrom) {
    throw new Error(missingSlugMessage('Source slug does not exist in vault', from, {
      createHint: true,
    }));
  }
  if (!canonicalTo) {
    throw new Error(missingSlugMessage('Target slug does not exist in vault', to, {
      createHint: true,
    }));
  }
  /*
   * ⚠️ **Both ends of a relation must be nodes** (measured 2026-08-08).
   *
   * The existence check above asks «is there a .md by that name». So it rejected
   * nonexistent slugs correctly but **let a diary memo through** — markdown that
   * is not a node lives in a vault legitimately, by design.
   *
   * The result is a dangling reference written into the graph. It is caught
   * afterwards (compile, maintenance queue), but only after the write, and in
   * between the graph carries a relation the compiler will discard. The write
   * gate saying it first is cheaper.
   */
  assertGraphNodeEndpoint(canonicalFrom, 'Source');
  assertGraphNodeEndpoint(canonicalTo, 'Target');
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (key === 'domain') {
    const existingDomain = doc.frontmatter.domain;
    if (relationRefMatches(existingDomain, canonicalTo)) {
      return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
    }
    if (typeof existingDomain === 'string' && existingDomain.trim()) {
      throw new Error(`Source slug already has domain "${existingDomain}". Use patch_concept to change it explicitly.`);
    }
    patchFrontmatter(VAULT_ROOT, canonicalFrom, { domain: canonicalTo }, {
      expectedMtime:
        typeof expected_mtime === 'number' ? expected_mtime : undefined,
    });
    return {
      ok: true,
      changed: true,
      from: canonicalFrom,
      to: canonicalTo,
      type,
      key,
      ...(options.includePostWriteMaintenance === false
        ? {}
        : { postWriteMaintenance: compactPostWriteMaintenance() }),
    };
  }
  const existing = relationRefsFor(doc, key);
  if (existing.some((ref) => relationRefMatches(ref, canonicalTo))) {
    return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type };
  }
  if (type === 'depends_on' && (typeof why !== 'string' || !why.trim())) {
    throw new Error(
      'why is required and must be nonblank for a new depends_on relation. ' +
      'Explain the stable semantic dependency after explicit human approval.',
    );
  }
  const next = normalizeRelationRefs([...existing, canonicalTo]);
  // Relation plus rationale (`why`) in a single frontmatter write: written
  // separately, a failure between them leaves a relation with no reason or a
  // reason with no relation.
  const patch = relationKeyPatch(doc, key, next);
  if (typeof why === 'string' && why.trim()) {
    const notes = { ...(doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object' ? doc.frontmatter.relation_notes : {}) };
    notes[canonicalTo] = why.trim();
    patch.relation_notes = notes;
  }
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, {
    expectedMtime:
      typeof expected_mtime === 'number' ? expected_mtime : undefined,
  });
  return {
    ok: true,
    changed: true,
    from: canonicalFrom,
    to: canonicalTo,
    type,
    key,
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

function removeRelation({ from, to, type, confirm = false, expected_mtime }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(type, 'type');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const key = RELATION_KEY[type];
  if (!key) throw new Error(formatAllowedValueError('type', type, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'remove_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalTo) throw new Error(missingSlugMessage('Target slug does not exist in vault', to));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  }
  const exists = relationExists(doc, key, canonicalTo);
  const notes = doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object'
    ? { ...doc.frontmatter.relation_notes }
    : {};
  const matchingNoteKeys = matchingRelationNoteKeys(notes, canonicalTo);
  const removedRationale = matchingNoteKeys
    .map((key) => notes[key])
    .find((value) => typeof value === 'string');
  const dryRun = !confirm;
  const base = {
    ok: exists,
    dryRun,
    changed: false,
    ...destructivePreviewState({
      dryRun,
      wouldChange: exists,
      blockedReasons: exists ? [] : ['relation does not exist; confirmation would be a no-op'],
    }),
    exists,
    from: canonicalFrom,
    to: canonicalTo,
    type,
    key,
    ...(removedRationale ? { removedRationale } : {}),
  };
  if (!exists || !confirm) return base;
  const patch = key === 'domain'
    ? { domain: null }
    : relationKeyPatch(
        doc,
        key,
        relationRefsFor(doc, key).filter((ref) => !relationRefMatches(ref, canonicalTo)),
      );
  for (const noteKey of matchingNoteKeys) delete notes[noteKey];
  patch.relation_notes = Object.keys(notes).length > 0 ? notes : null;
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, { expectedMtime: expected_mtime });
  return { ...base, ok: true, dryRun: false, changed: true, postWriteMaintenance: compactPostWriteMaintenance() };
}

function replaceRelation({ from, oldTo, oldType, newTo, newType, why, confirm = false, expected_mtime }) {
  for (const [value, name] of [[from, 'from'], [oldTo, 'oldTo'], [oldType, 'oldType'], [newTo, 'newTo'], [newType, 'newType']]) requireNonBlankString(value, name);
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  const oldKey = RELATION_KEY[oldType];
  const newKey = RELATION_KEY[newType];
  if (!oldKey) throw new Error(formatAllowedValueError('oldType', oldType, RELATION_TYPES));
  if (!newKey) throw new Error(formatAllowedValueError('newType', newType, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalOldTo = resolveExistingVaultSlug(oldTo);
  const canonicalNewTo = resolveExistingVaultSlug(newTo);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'replace_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalOldTo) throw new Error(missingSlugMessage('Old target slug does not exist in vault', oldTo));
  if (!canonicalNewTo) throw new Error(missingSlugMessage('New target slug does not exist in vault', newTo));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  if (!relationExists(doc, oldKey, canonicalOldTo)) throw new Error(`Relation does not exist: ${canonicalFrom} --${oldType}--> ${canonicalOldTo}.`);
  const oldRelation = { to: canonicalOldTo, type: oldType, key: oldKey };
  const newRelation = { to: canonicalNewTo, type: newType, key: newKey };
  // Rationale resolution happens before the dry-run return so the "every new
  // depends_on carries a why" contract (schema.mjs) holds here too — converting
  // an edge to depends_on used to slip through with no why and no prior note to
  // inherit (bug sweep 2026-09-01).
  const notes = doc.frontmatter.relation_notes && typeof doc.frontmatter.relation_notes === 'object' ? { ...doc.frontmatter.relation_notes } : {};
  const oldNoteKeys = matchingRelationNoteKeys(notes, canonicalOldTo);
  const priorWhy = oldNoteKeys
    .map((key) => notes[key])
    .find((value) => typeof value === 'string');
  const nextWhy = typeof why === 'string' && why.trim() ? why.trim() : priorWhy;
  if (newType === 'depends_on' && !nextWhy) {
    throw new Error(
      'why is required and must be nonblank when converting a relation to depends_on ' +
        `(${canonicalFrom} --${oldType}--> ${canonicalOldTo} carries no relation note to inherit). ` +
        'One sentence: why does the source depend on the target?',
    );
  }
  const dryRun = !confirm;
  const base = {
    ok: false,
    dryRun,
    changed: false,
    ...destructivePreviewState({ dryRun, wouldChange: true }),
    from: canonicalFrom,
    oldRelation,
    newRelation,
  };
  if (!confirm) return base;
  const patch = {};
  if (oldKey === 'domain') patch.domain = null;
  else {
    Object.assign(patch, relationKeyPatch(
      doc,
      oldKey,
      relationRefsFor(doc, oldKey).filter((ref) => !relationRefMatches(ref, canonicalOldTo)),
    ));
  }
  if (newKey === 'domain') patch.domain = canonicalNewTo;
  else {
    const starting = oldKey === newKey ? patch[newKey] : relationRefsFor(doc, newKey);
    Object.assign(patch, relationKeyPatch(doc, newKey, normalizeRelationRefs([...starting, canonicalNewTo])));
  }
  for (const noteKey of oldNoteKeys) delete notes[noteKey];
  if (nextWhy) notes[canonicalNewTo] = nextWhy;
  patch.relation_notes = Object.keys(notes).length > 0 ? notes : null;
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, { expectedMtime: expected_mtime });
  return { ...base, ok: true, dryRun: false, changed: true, postWriteMaintenance: compactPostWriteMaintenance() };
}

// Batch variant of add_relation, for landing relations whose meaning was already
// reviewed and approved. Rows are dispatched serially through addRelation, so the
// same `from` slug can appear in several rows and readDoc re-reads from disk each
// time, accumulating without loss (but passing expected_mtime alongside makes
// every row after the first stale and fail — the tool description says so). Input
// order preserved, partial results, no atomic rollback.
function addRelationsBatch({ relations }) {
  if (!Array.isArray(relations)) {
    throw new Error('relations must be an array of relation specs');
  }
  if (relations.length === 0) {
    return { relations: [] };
  }
  if (relations.length > 50) {
    throw new Error(
      `Too many relations: ${relations.length}. Max 50 per call — split into multiple add_relations batches.`
    );
  }
  const results = relations.map((spec, index) => {
    let from = '';
    let to = '';
    let type = '';
    try {
      requirePlainObject(spec, `relations[${index}]`);
      from = typeof spec.from === 'string' ? spec.from : '';
      to = typeof spec.to === 'string' ? spec.to : '';
      type = typeof spec.type === 'string' ? spec.type : '';
      requireAllowedObjectKeys(spec, `relations[${index}]`, [
        'from',
        'to',
        'type',
        'why',
        'expected_mtime',
      ]);
      return addRelation(spec, { includePostWriteMaintenance: false });
    } catch (err) {
      const rawMessage = err && err.message ? err.message : String(err);
      const rowLabel = `relations[${index}]`;
      const msg = rawMessage.includes(rowLabel) ? rawMessage : `${rowLabel} ${rawMessage}`;
      return {
        ok: false,
        from,
        to,
        type,
        error: msg,
        ...structuredRowErrorDetails(err, rawMessage),
      };
    }
  });
  return {
    relations: results,
    postWriteMaintenance: results.some((row) => row.ok && row.changed !== false)
      ? compactPostWriteMaintenance()
      : undefined,
  };
}

export {
  addRelation,
  removeRelation,
  replaceRelation,
  addRelationsBatch,
};
