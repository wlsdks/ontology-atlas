/**
 * Which frontmatter key holds which relation, and how a stored ref matches a
 * canonical slug. Read and write handlers both resolve edges through this, so it
 * stays a leaf: nothing here reaches back into a handler.
 */

import { WRITE_RELATION_TYPE_VALUES } from '../ontology-engine.mjs';
import { NEIGHBOR_KEY_ALIASES } from '../vault.mjs';
import { resolveExistingVaultSlug } from './vault-nodes.mjs';

const RELATION_KEY = {
  depends_on: 'dependencies',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  domain: 'domain',
};

const RELATION_TYPES = WRITE_RELATION_TYPE_VALUES;

function relationRefMatches(storedRef, canonicalTo) {
  if (typeof storedRef !== 'string') return false;
  const candidate = storedRef.trim();
  if (!candidate) return false;
  if (candidate === canonicalTo) return true;
  return resolveExistingVaultSlug(candidate) === canonicalTo;
}

/*
 * `depends_on:` is a legal authoring alias for `dependencies:` — the read layer
 * (collectNeighborRefs, the compiler) canonicalizes it, so the write layer must
 * see the same edges. Reading only the literal canonical key made an aliased
 * edge visible to get_concept's outgoingEdges yet "nonexistent" to
 * add/remove/replace_relation, which could then append a duplicate under a
 * second key or refuse to remove an edge the graph plainly renders.
 */
function aliasKeysFor(canonicalKey) {
  return Object.keys(NEIGHBOR_KEY_ALIASES)
    .filter((alias) => NEIGHBOR_KEY_ALIASES[alias] === canonicalKey);
}

function relationRefsFor(doc, canonicalKey) {
  const refs = [];
  for (const key of [canonicalKey, ...aliasKeysFor(canonicalKey)]) {
    const value = doc.frontmatter[key];
    if (Array.isArray(value)) refs.push(...value);
  }
  return refs;
}

/*
 * A write to a relation key consolidates its alias spellings into the canonical
 * key in the same patch: the alias arrays fold into `nextRefs` and are deleted,
 * so one edit never leaves the same edge type split across two frontmatter keys.
 */
function relationKeyPatch(doc, canonicalKey, nextRefs) {
  const patch = { [canonicalKey]: nextRefs };
  for (const alias of aliasKeysFor(canonicalKey)) {
    if (doc.frontmatter[alias] !== undefined) patch[alias] = null;
  }
  return patch;
}

function relationExists(doc, key, canonicalTo) {
  if (key === 'domain') return relationRefMatches(doc.frontmatter.domain, canonicalTo);
  return relationRefsFor(doc, key).some((ref) => relationRefMatches(ref, canonicalTo));
}

function matchingRelationNoteKeys(notes, canonicalTo) {
  return Object.keys(notes).filter((ref) => relationRefMatches(ref, canonicalTo));
}

function normalizeGraphRelationKey(type) {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  return RELATION_KEY[trimmed] || trimmed;
}

export {
  normalizeGraphRelationKey,
  RELATION_KEY,
  RELATION_TYPES,
  relationRefMatches,
  relationRefsFor,
  relationKeyPatch,
  relationExists,
  matchingRelationNoteKeys,
};
