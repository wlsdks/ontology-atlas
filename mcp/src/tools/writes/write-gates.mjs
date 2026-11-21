/**
 * The refusals every agent write passes before it touches disk: a frontmatter
 * patch that no agent may make, a node reserved for a person, a relation
 * endpoint that is not a graph node, and whether a destructive preview may be
 * confirmed. Nothing here writes.
 */

import {
  CREATED_BY_KEY,
  HUMAN_ONLY_REVIEW_KEYS,
  REVIEW_NOTE_KEY,
  REVIEW_STATES,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
} from '../../schema.mjs';
import { VAULT_ROOT } from '../../server/runtime.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../../server/tool-schemas/array-limits.mjs';
import {
  requireNonBlankString,
  requireOptionalStringArray,
} from '../../server/validate.mjs';
import { GRAPH_ARRAY_KEY_SET } from '../../vault/graph/relation-refs.mjs';
import { loadVaultDocs } from '../../vault/documents/document-cache.mjs';

const ADD_CONCEPT_KINDS = new Set(['project', 'domain', 'capability', 'element', 'document']);

function requireValidFrontmatterPatch(frontmatter) {
  if (frontmatter === undefined) return;
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!GRAPH_ARRAY_KEY_SET.has(key) || value === null || value === undefined) {
      continue;
    }
    requireOptionalStringArray(value, `frontmatter.${key}`, { max: GRAPH_REF_ARRAY_MAX_ITEMS });
  }
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'kind')) {
    const kind = frontmatter.kind;
    if (kind === null) {
      throw new Error('kind cannot be deleted from a vault node — pass a valid kind instead.');
    }
    requireNonBlankString(kind, 'frontmatter.kind');
    if (!ADD_CONCEPT_KINDS.has(kind)) {
      throw new Error(
        `frontmatter.kind must be one of: ${[...ADD_CONCEPT_KINDS].join(', ')}.`,
      );
    }
  }
  for (const key of ['domain', 'slug']) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
    const value = frontmatter[key];
    if (value === null || value === undefined) continue;
    requireNonBlankString(value, `frontmatter.${key}`);
  }
  // A patch is not authorship: `created_by` is proved by the call path at write time,
  // so existing values survive a patch, or an agent could relabel its node `human`.
  if (Object.prototype.hasOwnProperty.call(frontmatter, CREATED_BY_KEY)) {
    throw new Error(
      `frontmatter.${CREATED_BY_KEY} cannot be patched — authorship is stamped once, at write time, by the path that proves it. ` +
        'Patching an existing node is not authorship; leave the field as it is (or absent, which means unknown).',
    );
  }
  requireAgentWritableReviewFields(frontmatter);
}

/**
 * Raising `review_state: human_decides` is allowed; clearing or confirming is refused, since both
 * assert a person acted. A lane guard for this server's writes, not authentication: direct file
 * edits never meet it.
 */
function requireAgentWritableReviewFields(frontmatter) {
  for (const key of HUMAN_ONLY_REVIEW_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(frontmatter, key)) continue;
    throw new Error(
      `frontmatter.${key} records a person's review, so Atlas write tools do not set it — ` +
        'an agent writing it would be asserting the review, not recording it. ' +
        `If you cannot settle this node yourself, set ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES} with a ${REVIEW_NOTE_KEY} instead.`,
    );
  }
  if (!Object.prototype.hasOwnProperty.call(frontmatter, REVIEW_STATE_KEY)) return;
  const state = frontmatter[REVIEW_STATE_KEY];
  if (state === REVIEW_STATE_HUMAN_DECIDES) return;
  if (state === null || state === undefined || state === '') {
    throw new Error(
      `frontmatter.${REVIEW_STATE_KEY} cannot be cleared from this path — a reservation is released by the person who made it. ` +
        'Report the node instead; leaving it in place is the correct outcome of an agent turn.',
    );
  }
  if (state === REVIEW_STATE_CONFIRMED) {
    throw new Error(
      `frontmatter.${REVIEW_STATE_KEY}: ${REVIEW_STATE_CONFIRMED} states that a person judged this node, so Atlas write tools do not set it. ` +
        `Set ${REVIEW_STATE_HUMAN_DECIDES} with a ${REVIEW_NOTE_KEY} if you want a person to look at it.`,
    );
  }
  throw new Error(
    `frontmatter.${REVIEW_STATE_KEY} must be ${REVIEW_STATE_HUMAN_DECIDES} on this path (${REVIEW_STATES.join(' | ')} are the only values).`,
  );
}

/**
 * Refuses the whole write when the node itself is reserved, since the reserved
 * meaning lives in the body and relations too. Every write tool naming an existing
 * node runs this before touching disk.
 */
function requireNodeNotReservedForHuman(doc, operation) {
  const state = doc?.frontmatter?.[REVIEW_STATE_KEY];
  if (state !== REVIEW_STATE_HUMAN_DECIDES) return;
  const note = doc?.frontmatter?.[REVIEW_NOTE_KEY];
  throw new Error(
    `${operation} refused: ${doc?.slug ?? 'this node'} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person.` +
      (note ? ` What they have to decide: ${note}` : '') +
      ' Report it and let the person decide; only they release the reservation.',
  );
}

function destructivePreviewState({ dryRun, wouldChange, blockedReasons = [] }) {
  const reasons = [...new Set(blockedReasons.filter((reason) => typeof reason === 'string' && reason.trim()))];
  return {
    previewReady: dryRun,
    canConfirm: dryRun && wouldChange && reasons.length === 0,
    wouldChange: dryRun && wouldChange,
    blockedReasons: reasons,
  };
}

/**
 * Checks that a relation write's endpoints are graph nodes. Reads stay permissive
 * about non-node documents; only the write path narrows, naming why and where to go.
 */
function assertGraphNodeEndpoint(canonicalSlug, role) {
  const doc = loadVaultDocs(VAULT_ROOT).find((d) => d.slug === canonicalSlug);
  const kind = doc?.frontmatter?.kind;
  if (typeof kind === 'string' && kind.trim() !== '') return;
  throw new Error(
    `${role} "${canonicalSlug}" is not a graph node — it has no \`kind:\`, so a relation to it would be a ` +
      'dangling reference the compiler drops. Ordinary markdown (meeting notes, memos, drafts) lives in the ' +
      'same folder by design. To make it a node, add a `kind:` with patch_concept, or use absorb_document to ' +
      'turn its content into typed nodes.',
  );
}

export {
  ADD_CONCEPT_KINDS,
  assertGraphNodeEndpoint,
  destructivePreviewState,
  requireNodeNotReservedForHuman,
  requireValidFrontmatterPatch,
};
