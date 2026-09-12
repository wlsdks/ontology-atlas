/**
 * Node identity and the gates every write passes: resolving a slug or uid to the
 * document actually on disk, the not-found messages that name the next call, the
 * human-reserved and review-field checks, the authorship stamp, and the shared
 * destructive dry-run preview fields.
 *
 * It also holds the whole-vault issue finders — dangling graph refs, duplicate
 * slugs and uids — because they answer the same question (does this reference
 * resolve to a node?) and both `get_concept` and `validate_vault` ask it.
 *
 * Read and write workflows both sit on this, which is why it is its own module
 * rather than living with either side. Nothing here imports a handler.
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
  agentCreatedBy,
  nodeUidIssue,
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
  const err = new Error(`Doc not found: ${slug}`);
  const candidateSlugs = suggestSimilarSlugs(VAULT_ROOT, slug);
  // Check first whether the vault names this in a relation key: most of what the
  // screens (map, insights) count as concepts are reference-only concepts with no
  // document, so a flat "not found" turns every name a user copies off the screen
  // into a dead end.
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
  // A patch is not authorship (decision ledger, 2026-07-31). `created_by` is a
  // fact the call path proved at write time, so it cannot be rewritten later — if
  // it could, an agent could relabel its own node `human`, and the field would
  // stop being a fact and become a claim. Existing values survive a patch intact.
  if (Object.prototype.hasOwnProperty.call(frontmatter, CREATED_BY_KEY)) {
    throw new Error(
      `frontmatter.${CREATED_BY_KEY} cannot be patched — authorship is stamped once, at write time, by the path that proves it. ` +
        'Patching an existing node is not authorship; leave the field as it is (or absent, which means unknown).',
    );
  }
  requireAgentWritableReviewFields(frontmatter);
}

/**
 * The human-judgment half of a patch, on the one call path that is provably an
 * agent (`docs/benchmark/FINDINGS-2026-09-02-review-marks.md`).
 *
 * Measured, with the rule written in the vault's own `AGENTS.md`: one of three
 * model tiers deleted a live `review_state: human_decides` and replaced it with
 * `review_state: confirmed` plus a `reviewed_by` name it had never been given.
 * A documented convention is honoured in proportion to model capability, so the
 * refusal has to live here, where the call path — not the prompt — decides.
 *
 * ⚠️ **What this is not.** It is a lane guard, not authentication. It decides
 * who may write *through this server*; an agent with ordinary file tools edits
 * the Markdown directly and never meets it, and the binding is an unkeyed hash
 * anyone can recompute. So a stamp here means "no Atlas write tool produced
 * this", never "a person did" — and nothing in this product may say otherwise
 * (Codex review, 2026-09-02). What survives regardless is the Git diff: every
 * such edit is visible, attributable, and revertable, which is the same trust
 * model `forbidden.md` already uses for declarative extensions.
 *
 * The asymmetry is deliberate and is the whole mechanism:
 *
 *   - **Raising is allowed.** An agent that cannot settle a question may write
 *     `review_state: human_decides` and a `review_note`. That is the behaviour
 *     the product wants, and refusing it would leave an agent with no way to
 *     hand work back.
 *   - **Clearing and confirming are refused.** Both assert that a person acted.
 *     Nothing in the file afterwards distinguishes an agent-typed `confirmed`
 *     from a person-typed one, which is exactly why this cannot be a default an
 *     instruction can override.
 *
 * This gate covers writes that come through this server. It cannot reach a
 * direct file edit, and it is not described anywhere as if it could — the
 * durable half of the design is `reviewDigest`, which needs no cooperation.
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
 * The node itself is reserved — refuse the whole write, not just its review keys.
 *
 * A reservation that only protected its own frontmatter would be worthless: the
 * meaning a person reserved lives in the body and the relations, and an agent
 * rewriting those while leaving the marker intact is the failure this exists to
 * stop. Every write tool that names an existing node runs this before touching
 * disk, so the refusal cannot be reached by choosing a different tool.
 */
/**
 * The node as it is on disk, or `null` when it is not there yet.
 *
 * A missing file is not an error here: the reservation guard asks "is this node
 * reserved", and a node that does not exist cannot be. Its own write path
 * reports the missing file with the message that fits that operation.
 */
function readDocIfPresent(slug) {
  try {
    return readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, slug));
  } catch {
    return null;
  }
}

/**
 * What a person has ruled on this node — the half a following agent has to be
 * able to retrieve, or the reservation is only a screen decoration.
 *
 * `currentness` is the answer the call-path gate cannot give, because a direct
 * file edit never passes through this server. It is recomputed from the file on
 * every read, so an approval that no longer describes its node says so without
 * anyone having noticed the change or cooperated in reporting it.
 *
 * **`digestNow` was here and was removed** (Codex review, 2026-09-02). It was
 * returned so a human-proving path could bind an approval with the same function
 * this server checks it with. But this server's caller *is* the agent, and the
 * binding is an unkeyed hash: handing over the value that makes a stamp look
 * current is handing over the forgery. The app computes its own through the
 * contract-tested twin, and nothing else needs it.
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
 * Authorship stamp — a write that came through this server was made by **an
 * agent**. The call path itself proves that, so it cannot be forged, and this is
 * the only place it is stamped.
 *
 * The name reuses the identity the activity log (`activity.jsonl`) already
 * writes, resolved the same way — heartbeat > the connect greeting's
 * clientInfo.name > unknown (2026-09-07; the activity log made that move on
 * 2026-08-13 and the stamp lagged, so a node written from the app's own agent
 * conversation said `agent:unknown` while the log beside it said `claude-code`).
 * No second identity scheme. With neither only the name is unknown — a human
 * still did not write it — so it is `agent:unknown` (decision ledger, 2026-07-31).
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
 * Checks that the endpoints of a relation **write** are graph nodes.
 *
 * The read tools (`get_concept`, `find_neighbors`) legitimately handle documents
 * that are not nodes, so `resolveExistingVaultSlug` itself stays permissive —
 * only the write path narrows. A rejection follows this repository's refusal
 * grammar: **why it cannot happen, and where to go instead.**
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

function resolveExistingVaultSlug(slug, docs = null) {
  if (typeof slug !== 'string' || slug.trim() === '') return null;
  // Canonicalize letter case to the on-disk spelling before returning. On macOS
  // and Windows `existsSync` accepts a wrong-case slug, but every backlink and
  // relation match downstream is a case-sensitive string comparison — returning
  // the caller's spelling here made writes target refs that no document uses.
  const canonicalCase = canonicalDiskSlug(VAULT_ROOT, slug);
  if (canonicalCase) return canonicalCase;
  const vaultDocs = docs ?? loadVaultDocs(VAULT_ROOT);
  const tailMatches = [];
  const frontmatterMatches = [];
  for (const doc of vaultDocs) {
    const tail = doc.slug.split('/').pop();
    if (tail === slug) tailMatches.push(doc.slug);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() === slug) {
      frontmatterMatches.push(doc.slug);
    }
  }
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

// validate_vault — one call gives an agent the whole vault's health, in the same
// shape as CLI `ontology-atlas validate --json`. It fills the gap between per-doc
// `warnings` (get_concept) and the vault aggregate (`vaultWarnings` in
// list_concepts): a detailed report combining both.
/**
 * Builds the summary-freshness section of `validate_vault`.
 *
 * Reports domains and projects whose containment list changed after their
 * description was last written — the update path nothing else in this tool checks.
 * `pathDrift` asks whether a node still points at real code; this asks whether a
 * node still describes what it holds.
 *
 * Advisory only. A stale description blocks nothing and is never rewritten here:
 * the body is a human judgement, so the tool asks for a re-judgement and stops.
 *
 * Degrades to `checked: false` outside a repository rather than reporting a clean
 * bill, because not looking is not the same as finding nothing. History reading is
 * bounded to summary nodes (8 of 83 in the dogfood vault), so a vault of ordinary
 * size pays well under a second.
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
  const stack = [{ dir: join(VAULT_ROOT, 'sources'), prefix: 'sources' }];
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
 * Two documents claiming the same canonical slug (measured 2026-07-29).
 *
 * **A per-file check cannot catch this in principle** — either file alone looks
 * fine. It arises because `patch_concept` did not stop `frontmatter.slug` being
 * overwritten with a value another node already uses (add_concept blocks it and
 * rename_concept demands `overwrite`; only this path was open). Once it happens,
 * no relation naming that slug can be resolved to one side. The compiler saw
 * `ambiguous-alias` while `validate_vault` quietly returned clean.
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
