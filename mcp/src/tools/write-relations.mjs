import { statSync } from 'node:fs';
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
import { normalizeRelationRefs } from '../vault/relation-refs.mjs';
import { slugToPath } from '../vault/slug-paths.mjs';
import { readDoc } from '../vault/documents.mjs';
import { VaultConflictError } from '../vault/atomic-writes.mjs';
import { patchFrontmatter } from '../vault/doc-writes.mjs';
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
  universalQuoter,
} from './vault-nodes.mjs';

/**
 * The typed containment key `contains` stands for when the endpoint kinds have one
 * (spec §5: `contains` is for containment the typed keys do not fit), so one
 * project's containment is written in one vocabulary whichever word the writer used.
 */
const TYPED_CONTAINMENT = Object.freeze({
  domain: Object.freeze({ type: 'domains', parents: new Set(['project']) }),
  capability: Object.freeze({ type: 'capabilities', parents: new Set(['project', 'domain']) }),
  element: Object.freeze({ type: 'elements', parents: new Set(['project', 'domain', 'capability']) }),
});

function typedContainmentType(fromKind, toKind) {
  const typed = TYPED_CONTAINMENT[toKind];
  return typed && typed.parents.has(fromKind) ? typed.type : null;
}

/**
 * The type an existing `contains` edge is stored under: the typed key `add_relation`
 * wrote it as, or a raw `contains` entry written before that mapping.
 */
function storedContainmentType(doc, requestedType, toKind, canonicalTo) {
  if (requestedType !== 'contains') return requestedType;
  const typed = typedContainmentType(doc.frontmatter.kind, toKind);
  return typed && relationExists(doc, RELATION_KEY[typed], canonicalTo) ? typed : requestedType;
}

function containmentNotice(requestedType, type, fromKind, toKind) {
  return requestedType === 'contains' && type !== 'contains'
    ? `"contains" from a ${fromKind} to a ${toKind} is written as the typed key "${type}"; cite it as --${type}--> in competency Relations rows.`
    : null;
}

function fileMtime(slug) {
  return statSync(slugToPath(VAULT_ROOT, slug)).mtimeMs;
}

// A relation write patches frontmatter on whatever the file holds now, so its mtime
// proves a read only when the call itself was guarded by the caller's last mtime.
// Unguarded, the mtime would let a later body write pass over an edit nobody read.
function guardedMtime(expectedMtime, readMtime, currentMtime) {
  return typeof expectedMtime === 'number' && expectedMtime === readMtime ? { mtime: currentMtime } : {};
}

const quoted = (warnings) => (warnings.length > 0 ? { warnings } : {});

function addRelation({ from, to, type: requestedType, why, expected_mtime }, options = {}) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(requestedType, 'type');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (!RELATION_KEY[requestedType]) {
    throw new Error(formatAllowedValueError('type', requestedType, RELATION_TYPES));
  }
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  const fromKind = readDocIfPresent(canonicalFrom ?? from)?.frontmatter?.kind;
  const toKind = readDocIfPresent(canonicalTo ?? to)?.frontmatter?.kind;
  const typed = requestedType === 'contains' ? typedContainmentType(fromKind, toKind) : null;
  const type = typed ?? requestedType;
  const key = RELATION_KEY[type];
  const notice = containmentNotice(requestedType, type, fromKind, toKind);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'add_relation');
  // Both endpoints must exist, so a typo or hallucinated slug is an error rather than
  // a dangling reference; tail and frontmatter slug aliases are stored as the
  // canonical slug.
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
  // Both ends must be graph nodes, not just existing .md files, or a memo in the
  // vault becomes a dangling reference the compiler later discards.
  assertGraphNodeEndpoint(canonicalFrom, 'Source');
  assertGraphNodeEndpoint(canonicalTo, 'Target');
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (key === 'domain') {
    const existingDomain = doc.frontmatter.domain;
    if (relationRefMatches(existingDomain, canonicalTo)) {
      return { ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type, ...guardedMtime(expected_mtime, doc.mtime, doc.mtime) };
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
      ...guardedMtime(expected_mtime, expected_mtime, fileMtime(canonicalFrom)),
      ...(options.includePostWriteMaintenance === false
        ? {}
        : { postWriteMaintenance: compactPostWriteMaintenance() }),
    };
  }
  const existing = relationRefsFor(doc, key);
  if (existing.some((ref) => relationRefMatches(ref, canonicalTo))
    || (typed && relationExists(doc, 'contains', canonicalTo))) {
    return {
      ok: true, alreadyExists: true, changed: false, from: canonicalFrom, to: canonicalTo, type,
      ...guardedMtime(expected_mtime, doc.mtime, doc.mtime),
      ...(notice ? { notice } : {}),
    };
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
    ...guardedMtime(expected_mtime, expected_mtime, fileMtime(canonicalFrom)),
    ...(notice ? { notice } : {}),
    ...quoted((options.quoter ?? universalQuoter()).quote(why)),
    ...(options.includePostWriteMaintenance === false
      ? {}
      : { postWriteMaintenance: compactPostWriteMaintenance() }),
  };
}

function removeRelation({ from, to, type: requestedType, confirm = false, expected_mtime }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireNonBlankString(requestedType, 'type');
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (!RELATION_KEY[requestedType]) throw new Error(formatAllowedValueError('type', requestedType, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalTo = resolveExistingVaultSlug(to);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'remove_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalTo) throw new Error(missingSlugMessage('Target slug does not exist in vault', to));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) {
    throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  }
  const toKind = readDocIfPresent(canonicalTo)?.frontmatter?.kind;
  const type = storedContainmentType(doc, requestedType, toKind, canonicalTo);
  const key = RELATION_KEY[type];
  const notice = containmentNotice(requestedType, type, doc.frontmatter.kind, toKind);
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
    ...(notice ? { notice } : {}),
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

function replaceRelation({ from, oldTo, oldType: requestedOldType, newTo, newType: requestedNewType, why, confirm = false, expected_mtime }) {
  for (const [value, name] of [[from, 'from'], [oldTo, 'oldTo'], [requestedOldType, 'oldType'], [newTo, 'newTo'], [requestedNewType, 'newType']]) requireNonBlankString(value, name);
  requireOptionalBoolean(confirm, 'confirm');
  requireOptionalNonNegativeNumber(expected_mtime, 'expected_mtime');
  if (!RELATION_KEY[requestedOldType]) throw new Error(formatAllowedValueError('oldType', requestedOldType, RELATION_TYPES));
  if (!RELATION_KEY[requestedNewType]) throw new Error(formatAllowedValueError('newType', requestedNewType, RELATION_TYPES));
  const canonicalFrom = resolveExistingVaultSlug(from);
  const canonicalOldTo = resolveExistingVaultSlug(oldTo);
  const canonicalNewTo = resolveExistingVaultSlug(newTo);
  requireNodeNotReservedForHuman(readDocIfPresent(canonicalFrom ?? from), 'replace_relation');
  if (!canonicalFrom) throw new Error(missingSlugMessage('Source slug does not exist in vault', from));
  if (!canonicalOldTo) throw new Error(missingSlugMessage('Old target slug does not exist in vault', oldTo));
  if (!canonicalNewTo) throw new Error(missingSlugMessage('New target slug does not exist in vault', newTo));
  const doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalFrom));
  if (typeof expected_mtime === 'number' && doc.mtime !== expected_mtime) throw new VaultConflictError(canonicalFrom, expected_mtime, doc.mtime);
  const fromKind = doc.frontmatter.kind;
  const newToKind = readDocIfPresent(canonicalNewTo)?.frontmatter?.kind;
  const oldType = storedContainmentType(doc, requestedOldType, readDocIfPresent(canonicalOldTo)?.frontmatter?.kind, canonicalOldTo);
  const newType = (requestedNewType === 'contains' ? typedContainmentType(fromKind, newToKind) : null) ?? requestedNewType;
  const oldKey = RELATION_KEY[oldType];
  const newKey = RELATION_KEY[newType];
  const notice = containmentNotice(requestedNewType, newType, fromKind, newToKind);
  if (!relationExists(doc, oldKey, canonicalOldTo)) throw new Error(`Relation does not exist: ${canonicalFrom} --${oldType}--> ${canonicalOldTo}.`);
  const oldRelation = { to: canonicalOldTo, type: oldType, key: oldKey };
  const newRelation = { to: canonicalNewTo, type: newType, key: newKey };
  // Resolve the rationale before the dry-run return, so converting an edge to
  // depends_on still needs a `why` (schema.mjs).
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
    ...(notice ? { notice } : {}),
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
    // The old key's patch is `null` once its only entry is taken out (`relationKeyPatch`), and a
    // same-key retarget starts from that emptied list, not from a deleted key.
    const starting = oldKey === newKey ? (patch[newKey] ?? []) : relationRefsFor(doc, newKey);
    Object.assign(patch, relationKeyPatch(doc, newKey, normalizeRelationRefs([...starting, canonicalNewTo])));
  }
  for (const noteKey of oldNoteKeys) delete notes[noteKey];
  if (nextWhy) notes[canonicalNewTo] = nextWhy;
  patch.relation_notes = Object.keys(notes).length > 0 ? notes : null;
  patchFrontmatter(VAULT_ROOT, canonicalFrom, patch, { expectedMtime: expected_mtime });
  return { ...base, ok: true, dryRun: false, changed: true, postWriteMaintenance: compactPostWriteMaintenance() };
}

// Batch add_relation for already-approved relations. Rows run serially, so one
// `from` may repeat (but expected_mtime then makes later rows stale). Input order
// preserved, partial results, no atomic rollback.
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
  const quoter = universalQuoter();
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
      return addRelation(spec, { includePostWriteMaintenance: false, quoter });
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
  // A row's own `mtime` goes stale when a later row writes the same source, so the
  // batch also returns each touched source's mtime after the last row, but only for a
  // source whose first changed row was guarded by `expected_mtime` (`guardedMtime`).
  const guarded = new Map();
  for (const row of results) {
    if (!row.ok || row.changed !== true || guarded.has(row.from)) continue;
    guarded.set(row.from, typeof row.mtime === 'number');
  }
  const mtimes = {};
  for (const [from, proven] of guarded) {
    if (!proven) continue;
    try { mtimes[from] = fileMtime(from); } catch { /* removed meanwhile */ }
  }
  return {
    relations: results,
    ...(Object.keys(mtimes).length > 0 ? { mtimes } : {}),
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
