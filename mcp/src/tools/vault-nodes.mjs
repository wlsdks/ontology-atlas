/**
 * Node identity and the gates every write passes: slug/uid resolution, not-found
 * messages naming the next call, human-reserved and review-field checks, the
 * authorship stamp, and the whole-vault finders for dangling refs and duplicate
 * slugs and uids. Nothing here imports a handler.
 */

import { resolveAgentName } from '../activity-log.mjs';
import { collectNodeRevisions } from '../git-tools.mjs';
import { buildSlugNotFoundGrowthHint } from '../growth-hint.mjs';
import {
  CREATED_BY_KEY,
  HUMAN_ONLY_REVIEW_KEYS,
  REVIEWED_AT_KEY,
  REVIEWED_BY_KEY,
  REVIEW_NOTE_KEY,
  REVIEW_STATES,
  REVIEW_STATE_CONFIRMED,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  VAULT_SOURCES_DIR,
  agentCreatedBy,
  nodeUidIssue,
  rawSourceSlugIssue,
  reviewCurrentness,
} from '../schema.mjs';
import { server } from '../server/instance.mjs';
import {
  REPO_ROOT,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import { GRAPH_REF_ARRAY_MAX_ITEMS } from '../server/tool-schemas.mjs';
import {
  requireNonBlankString,
  requireOptionalStringArray,
} from '../server/validate.mjs';
import {
  SUMMARY_KINDS,
  describeStaleParent,
  findStaleParentSummaries,
  staleParentScore,
} from '../stale-parent.mjs';
import {
  GRAPH_ARRAY_KEYS,
  canonicalDiskSlug,
  collectNeighborRefs,
  findGraphReferences,
  loadVaultDocs,
  rawSourceSlugAt,
  readDoc,
  slugToPath,
  suggestSimilarSlugs,
} from '../vault.mjs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// The "Doc not found" text stays exactly as it is (the get_concepts batch and the
// verify contract depend on the literal string); only growthHint rides on the
// Error instance, and error() lifts it into structuredContent.
function docNotFoundError(slug, docs) {
  const rawSourceSlug = rawSourceSlugAt(VAULT_ROOT, slug);
  if (rawSourceSlug) {
    const err = new Error(`Doc not found: ${slug}. ${rawSourceSlugIssue(rawSourceSlug)}`);
    err.repairFields = { missingSubject: 'Doc not found', missingSlug: slug, recoveryTools: ['read_source'] };
    err.growthHint = buildSlugNotFoundGrowthHint({ slug, rawSourceSlug });
    return err;
  }
  const err = new Error(`Doc not found: ${slug}`);
  const candidateSlugs = suggestSimilarSlugs(VAULT_ROOT, slug);
  // A name the vault references without a document is a reference-only concept;
  // saying so keeps names copied off the map or insights from being a dead end.
  let referencedBy = [];
  try {
    referencedBy = findGraphReferences(docs ?? loadVaultDocs(VAULT_ROOT), slug);
  } catch {
    // Never fail the error path just because the vault could not be read.
    referencedBy = [];
  }
  err.repairFields = {
    missingSubject: 'Doc not found',
    missingSlug: slug,
    recoveryTools: ['list_concepts', 'find_evidence'],
    createTool: 'add_concept',
    similarSlugs: candidateSlugs,
    ...(referencedBy.length > 0 ? { referencedBy } : {}),
  };
  err.growthHint = buildSlugNotFoundGrowthHint({ slug, candidateSlugs, referencedBy });
  return err;
}

function uidNotFoundError(uid) {
  const err = new Error(`Doc not found for uid: ${uid}`);
  err.repairFields = {
    missingSubject: 'Doc not found for uid',
    missingUid: uid,
    recoveryTools: ['list_concepts', 'find_evidence'],
  };
  return err;
}

const ADD_CONCEPT_KINDS = new Set(['project', 'domain', 'capability', 'element', 'document']);

const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

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
 * The human-judgment half of a patch
 * (`docs/benchmark/FINDINGS-2026-09-02-review-marks.md`). Raising
 * `review_state: human_decides` is allowed; clearing or confirming is refused,
 * because both assert a person acted and the file cannot tell who typed it.
 * A lane guard for writes through this server, not authentication: direct file
 * edits never meet it, and the Git diff stays the trust record.
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
 * The node as it is on disk, or `null` when it does not exist yet; a node that
 * does not exist cannot be reserved.
 */
function readDocIfPresent(slug) {
  try {
    return readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, slug));
  } catch {
    return null;
  }
}

/**
 * What a person has ruled on this node, recomputed from the file on every read so
 * `currentness` reveals an approval that no longer describes its node. No digest is
 * returned: the caller is the agent, and the value would let it forge a stamp.
 */
function describeReview(doc) {
  const frontmatter = doc?.frontmatter ?? {};
  const state = frontmatter[REVIEW_STATE_KEY] ?? null;
  const note = frontmatter[REVIEW_NOTE_KEY] ?? null;
  const currentness = reviewCurrentness(frontmatter, doc?.body ?? '');
  return {
    state,
    ...(note ? { note } : {}),
    ...(frontmatter[REVIEWED_BY_KEY] ? { reviewedBy: frontmatter[REVIEWED_BY_KEY] } : {}),
    ...(frontmatter[REVIEWED_AT_KEY] ? { reviewedAt: frontmatter[REVIEWED_AT_KEY] } : {}),
    currentness,
    ...(state === REVIEW_STATE_HUMAN_DECIDES
      ? {
          agentGuidance:
            'A person reserved this node. Do not write it — report it and let them decide. Atlas write tools refuse it.',
        }
      : {}),
    ...(currentness === 'changed-since-review'
      ? {
          agentGuidance:
            'This node changed after a person confirmed it, so the approval no longer describes what is here. Treat the meaning as unreviewed and say so.',
        }
      : {}),
  };
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

/**
 * Authorship stamp: a write through this server was made by an agent, which the
 * call path proves. The name resolves like the activity log's (heartbeat > the
 * connect greeting's clientInfo.name), else `agent:unknown`.
 */
function agentProvenance() {
  return agentCreatedBy(resolveAgentName(VAULT_ROOT, server.getClientVersion?.()));
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

const slugIndexByDocs = new WeakMap();

function slugIndexOf(docs) {
  let index = slugIndexByDocs.get(docs);
  if (index) return index;
  index = { slugs: new Set(), byTail: new Map(), byFrontmatterSlug: new Map() };
  const append = (map, key, slug) => {
    const slugs = map.get(key);
    if (slugs) slugs.push(slug);
    else map.set(key, [slug]);
  };
  for (const doc of docs) {
    index.slugs.add(doc.slug);
    append(index.byTail, doc.slug.split('/').pop(), doc.slug);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string') append(index.byFrontmatterSlug, fmSlug.trim(), doc.slug);
  }
  slugIndexByDocs.set(docs, index);
  return index;
}

function resolveExistingVaultSlug(slug, docs = null) {
  if (typeof slug !== 'string' || slug.trim() === '') return null;
  if (docs && slugIndexOf(docs).slugs.has(slug)) return slug;
  // Return the on-disk letter case: `existsSync` accepts a wrong-case slug on macOS
  // and Windows, but every backlink and relation match downstream is case-sensitive.
  const canonicalCase = canonicalDiskSlug(VAULT_ROOT, slug);
  if (canonicalCase) return canonicalCase;
  const index = slugIndexOf(docs ?? loadVaultDocs(VAULT_ROOT));
  const tailMatches = index.byTail.get(slug) ?? [];
  const frontmatterMatches = index.byFrontmatterSlug.get(slug) ?? [];
  if (frontmatterMatches.length > 1) {
    throw new Error(
      `Ambiguous frontmatter slug alias "${slug}" matches: ${frontmatterMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (frontmatterMatches.length === 1) return frontmatterMatches[0];
  if (tailMatches.length > 1) {
    throw new Error(
      `Ambiguous tail slug alias "${slug}" matches: ${tailMatches.join(', ')}. Use an exact vault-relative slug.`
    );
  }
  if (tailMatches.length === 1) return tailMatches[0];
  return null;
}

function resolveExistingVaultUid(uid, docs = null) {
  if (typeof uid !== 'string' || uid.trim() === '') return null;
  const vaultDocs = docs ?? loadVaultDocs(VAULT_ROOT);
  const primaryMatches = vaultDocs.filter((doc) => doc.frontmatter.uid === uid);
  if (primaryMatches.length > 1) {
    throw new Error(
      `Ambiguous permanent uid "${uid}" matches: ${primaryMatches.map((doc) => doc.slug).join(', ')}. Run validate_vault and repair duplicate-uid errors before reading by uid.`,
    );
  }
  if (primaryMatches.length === 1) return primaryMatches[0].slug;

  const mergedMatches = vaultDocs.filter(
    (doc) => Array.isArray(doc.frontmatter.merged_uids) && doc.frontmatter.merged_uids.includes(uid),
  );
  if (mergedMatches.length > 1) {
    throw new Error(
      `Ambiguous merged uid "${uid}" matches: ${mergedMatches.map((doc) => doc.slug).join(', ')}. Run validate_vault and repair merged uid ownership before reading by uid.`,
    );
  }
  return mergedMatches[0]?.slug ?? null;
}

function missingSlugMessage(prefix, slug, { createHint = false } = {}) {
  const rawSourceSlug = rawSourceSlugAt(VAULT_ROOT, slug);
  if (rawSourceSlug) return rawSourceSlugIssue(rawSourceSlug);
  const suggestions = suggestSimilarSlugs(VAULT_ROOT, slug);
  const lines = [
    `${prefix}: "${slug}". Use list_concepts() to see all slugs, or find_evidence({title:"${slug}"}) to search by title.`,
  ];
  if (createHint) {
    lines.push('If the endpoint is real but absent, create it first with add_concept(slug, kind, title).');
  }
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

/**
 * The summary-freshness section of `validate_vault`: domains and projects whose
 * containment changed after their description was written. Advisory only, and
 * `checked: false` outside a repository, since not looking is not finding nothing.
 */
function buildSummaryFreshness(docs) {
  const summarySlugs = docs
    .filter((doc) => SUMMARY_KINDS.includes(doc?.frontmatter?.kind))
    .map((doc) => doc.slug);
  if (summarySlugs.length === 0) {
    return {
      checked: true,
      summaryNodes: 0,
      stale: [],
      hint: 'no domain or project nodes to check.',
    };
  }
  const revisions = collectNodeRevisions({
    repoRoot: REPO_ROOT,
    vaultRoot: VAULT_ROOT,
    slugs: summarySlugs,
  });
  if (!revisions.ok) {
    return {
      checked: false,
      summaryNodes: summarySlugs.length,
      stale: [],
      hint: `Summary freshness was NOT checked (${revisions.reason}). This comparison reads Git history, so a vault outside a repository cannot be judged — read each domain against the nodes it contains by hand.`,
    };
  }
  const stale = findStaleParentSummaries({
    docs,
    revisionsOf: (slug) => revisions.revisionsBySlug.get(slug) ?? [],
  }).map((row) => ({ ...row, score: staleParentScore(row), hint: describeStaleParent(row) }));

  return {
    checked: true,
    summaryNodes: summarySlugs.length,
    stale,
    hint:
      stale.length > 0
        ? `${stale.length} summary node(s) declare a membership that changed after their description was last written. Nothing is blocked; read each against the nodes it contains and re-judge the body.`
        : `all ${summarySlugs.length} summary node(s) were described after their membership last changed.`,
  };
}

function listVaultSourcePaths() {
  const out = [];
  const stack = [{ dir: join(VAULT_ROOT, VAULT_SOURCES_DIR), prefix: VAULT_SOURCES_DIR }];
  while (stack.length > 0) {
    const { dir, prefix } = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) stack.push({ dir: join(dir, entry.name), prefix: relative });
      else if (entry.isFile()) out.push(relative);
    }
  }
  return out;
}

function isPathLikeGraphRef(ref) {
  return (
    ref.startsWith('src/') ||
    ref.startsWith('mcp/') ||
    ref.startsWith('cli/') ||
    ref.startsWith('scripts/') ||
    ref.startsWith('.claude/') ||
    /\.[A-Za-z0-9]+$/.test(ref)
  );
}

function findDanglingGraphReferenceIssues(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFull = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (tail && tail !== slug && !tailToFull.has(tail)) {
      tailToFull.set(tail, slug);
    }
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  const resolveRef = (rawRef) => {
    if (typeof rawRef !== 'string') return null;
    // Normalise references to NFC as well — slugs are already NFC via
    // `pathToSlug`. Normalising one side only leaves characters that look
    // identical but do not match.
    const ref = rawRef.normalize('NFC');
    if (slugs.has(ref)) return ref;
    if (frontmatterSlugToFull.has(ref)) return frontmatterSlugToFull.get(ref);
    if (tailToFull.has(ref)) return tailToFull.get(ref);
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) return slug;
    }
    return null;
  };
  const issues = [];
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      if (typeof ref !== 'string' || ref.trim() === '') continue;
      if (key === 'elements' && isPathLikeGraphRef(ref)) continue;
      if (resolveRef(ref)) continue;
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'dangling-graph-reference',
          severity: 'warning',
          message: `\`${key}:\` graph reference "${ref}" does not resolve to any node in the vault.`,
        },
      });
    }
  }
  return issues;
}

function groupDanglingIssuesBySlug(docs) {
  const bySlug = new Map();
  for (const { slug, issue } of findDanglingGraphReferenceIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  // Duplicate slugs ride the same whole-vault pass: both are the kind of defect
  // that looks fine one file at a time, so this is the only place that can see them.
  for (const { slug, issue } of findDuplicateSlugIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  for (const { slug, issue } of findDuplicateUidIssues(docs)) {
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(issue);
  }
  return bySlug;
}

/**
 * Two documents claiming the same canonical slug. Either file alone looks fine, so
 * only a whole-vault pass sees it; no relation naming that slug resolves to one side.
 */
function findDuplicateSlugIssues(docs) {
  const byDeclared = new Map();
  for (const doc of docs ?? []) {
    const declared = doc?.frontmatter?.slug;
    const value = typeof declared === 'string' ? declared.trim() : '';
    if (!value) continue;
    if (!byDeclared.has(value)) byDeclared.set(value, []);
    byDeclared.get(value).push(doc);
  }
  const issues = [];
  for (const [declared, group] of byDeclared) {
    if (group.length < 2) continue;
    const all = group.map((doc) => doc.slug);
    for (const doc of group) {
      const rest = all.filter((slug) => slug !== doc.slug);
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'duplicate-slug',
          severity: 'error',
          message:
            `\`slug: ${declared}\` is also claimed by ${rest.join(', ')}. ` +
            `Relations naming it cannot resolve to one node — change one slug or merge with rename_concept.`,
        },
      });
    }
  }
  return issues;
}

function findDuplicateUidIssues(docs) {
  const claimsByUid = new Map();
  for (const doc of docs ?? []) {
    const claims = new Set([
      doc?.frontmatter?.uid,
      ...(Array.isArray(doc?.frontmatter?.merged_uids) ? doc.frontmatter.merged_uids : []),
    ]);
    for (const uid of claims) {
      if (nodeUidIssue(uid)) continue;
      if (!claimsByUid.has(uid)) claimsByUid.set(uid, []);
      claimsByUid.get(uid).push(doc);
    }
  }

  const issues = [];
  for (const [uid, group] of claimsByUid) {
    if (group.length < 2) continue;
    const all = group.map((doc) => doc.slug);
    for (const doc of group) {
      const rest = all.filter((slug) => slug !== doc.slug);
      issues.push({
        slug: doc.slug,
        issue: {
          code: 'duplicate-uid',
          severity: 'error',
          message:
            `UID ${uid} is also claimed by ${rest.join(', ')} as a primary or merged identity. ` +
            'Permanent identity must resolve to exactly one surviving node.',
        },
      });
    }
  }
  return issues;
}

export {
  groupDanglingIssuesBySlug,
  listVaultSourcePaths,
  buildSummaryFreshness,
  docNotFoundError,
  uidNotFoundError,
  ADD_CONCEPT_KINDS,
  requireValidFrontmatterPatch,
  readDocIfPresent,
  describeReview,
  requireNodeNotReservedForHuman,
  agentProvenance,
  destructivePreviewState,
  assertGraphNodeEndpoint,
  resolveExistingVaultSlug,
  resolveExistingVaultUid,
  missingSlugMessage,
};
