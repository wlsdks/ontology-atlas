/**
 * The side-effect-free vault reads: connection facts, listing, searching and
 * fetching concepts, backlinks, neighbors, paths, kinds, and source passages.
 */

import {
  COMPETENCY_ANSWERS_GUIDE_EN,
  CONSTRUCTION_CARD_EN,
  CONSTRUCTION_GUIDE_EN,
  CONSTRUCTION_GUIDE_TOPICS,
} from '../construction/construction-card.mjs';
import { META_MODEL_RULES_EN } from '../construction/construction-rules.mjs';
import { scoreEvidence } from '../evidence-search/evidence-score.mjs';
import {
  buildFilterZeroRowsGrowthHint,
  buildFindPathGrowthHint,
  buildMentionsZeroHitsGrowthHint,
  findNearTitleMatches,
} from '../ontology-engine/growth-hint.mjs';
import { NODE_KIND_VALUES } from '../ontology-engine.mjs';
import { parseFilter } from '../query.mjs';
import { nodeUidIssue } from '../schema.mjs';
import { SERVER_VERSION } from '../server-version.mjs';
import {
  WORKFLOWS_SECTION_EN,
  WRITE_SAFETY_SECTION_EN,
} from '../server/instructions.mjs';
import {
  READ_ONLY_MODE,
  TOOLS_FOR_LIST,
} from '../server/registry.mjs';
import { structuredRowErrorDetails } from '../server/rpc.mjs';
import {
  REPO_RESOLUTION,
  REPO_ROOT,
  VAULT_RESOLUTION,
  VAULT_ROOT,
} from '../server/runtime.mjs';
import {
  requireBodyMode,
  requireNonBlankString,
  requireOptionalBoolean,
  requireOptionalDirection,
  requireOptionalEnum,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalNonNegativeNumber,
  requireOptionalPositiveInteger,
  requireOptionalRelationTypeArray,
} from '../server/validate.mjs';
import { namesHiddenOrCredentialFile } from '../evidence-search/credential-names.mjs';
import { readStableFile } from '../evidence-search/source-evidence.mjs';
import { READ_SOURCE_MAX_FILE_BYTES, readSourceText } from '../library/source-text.mjs';
import {
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
  validateVaultDocument,
} from '../validate.mjs';
import {
  collectNeighborRefs,
  normalizeRelationRefs,
  relationNoteFor,
} from '../vault/graph/relation-refs.mjs';
import { slugToPath } from '../vault/documents/slug-paths.mjs';
import { docBodyIncluder, loadedDocIsEmpty, validateLoadedVaultDocument } from '../vault/documents/doc-facts.mjs';
import { FULL_BODY_MAX_CHARS, GET_CONCEPTS_FULL_BODY_MAX, describeBodyDelivery } from '../vault/documents/body-delivery.mjs';
import {
  loadVaultDocs,
  readDoc,
} from '../vault/documents/document-cache.mjs';
import { findBacklinks, findPath, listKinds } from '../vault/graph/graph-queries.mjs';
import {
  normalizeGraphRelationKey,
  relationRefsFor,
} from './relation-keys.mjs';
import {
  describeReview,
  docNotFoundError,
  groupDanglingIssuesBySlug,
  indexedBatchReadContext,
  resolveExistingVaultSlug,
  resolveExistingVaultUid,
  uidNotFoundError,
} from './vault-nodes.mjs';
import { createHash } from 'node:crypto';
import { compareText } from '../compare-text.mjs';

function listConcepts({ kind, domain, since, summary, mentions, filter, offset = 0, limit = 100 }) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNonBlankString(domain, 'domain');
  requireOptionalNonNegativeNumber(since, 'since');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalNonBlankString(mentions, 'mentions');
  requireOptionalNonBlankString(filter, 'filter');
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const parsedFilter = filter === undefined ? null : parseFilter(filter);
  const docs = loadVaultDocs(VAULT_ROOT);

  // Vault-wide validation counts. Every raw doc is validated so silent
  // corruption becomes visible, and an agent sees the vault's state in one call.
  let errorCount = 0;
  let warningCount = 0;
  // Group by slug before counting, so a node its project already contains is not
  // counted as parentless; this number is `list_concepts.vaultWarnings`, which
  // `mcp-verify` fails on.
  const issuesBySlugForCount = new Map();
  for (const doc of docs) {
    if (loadedDocIsEmpty(doc)) continue;
    const report = validateLoadedVaultDocument(doc);
    if (report.issues.length > 0) issuesBySlugForCount.set(doc.slug, [...report.issues]);
  }
  for (const [slug, issues] of groupDanglingIssuesBySlug(docs, undefined, false)) {
    issuesBySlugForCount.set(slug, [...(issuesBySlugForCount.get(slug) ?? []), ...issues]);
  }
  suppressParentedExpectedFieldIssues(issuesBySlugForCount, docs);
  // A wiki page carries no `kind:` by contract; the absence is the rule, not a finding.
  suppressLibraryKindIssues(issuesBySlugForCount);
  for (const issues of issuesBySlugForCount.values()) {
    for (const issue of issues) {
      if (issue.severity === 'error') errorCount += 1;
      else warningCount += 1;
    }
  }

  // With a numeric `since` (ms), only docs with mtime > since pass, for incremental
  // sync from the previous response's maximum mtime. Equal mtimes are excluded, so
  // resending the max never double-fetches.
  const sinceMs = typeof since === 'number' && Number.isFinite(since) ? since : null;
  const narrowed = docs.filter((doc) => {
    const docKind = doc.frontmatter.kind;
    if (kind && docKind !== kind) return false;
    if (!docKind) return false; // A frontmatter `kind:` is what makes it an ontology node.
    // Domain filter on frontmatter `domain:`, applied across kinds, so "every
    // capability in the auth domain" needs no filter expression.
    if (domain && doc.frontmatter.domain !== domain) return false;
    if (sinceMs !== null && (typeof doc.mtime !== 'number' || doc.mtime <= sinceMs)) return false;
    return true;
  });
  const selected = parsedFilter ? narrowed.filter((doc) => parsedFilter.match(doc)) : narrowed;
  // Best mention first (score desc, then slug asc); without `mentions`, slug order alone.
  const ranked = mentions === undefined
    ? selected.map((doc) => ({ doc })).sort((a, b) => compareText(a.doc.slug, b.doc.slug))
    : rankByMentions(selected, mentions);
  const filtered = ranked.map(({ doc }) => doc);
  if (offset > filtered.length) {
    throw new Error(
      `offset must be less than or equal to the total matching nodes (${filtered.length}); Received: ${offset}.`,
    );
  }
  const page = ranked.slice(offset, offset + limit);
  const summaryTruncatedSlugs = [];
  const nodes = page.map(({ doc, matchedIn, score }) => {
    // Opt-in summary, so one list call answers "what is each node about?".
    // Capped at 200 chars to keep the payload from ballooning. Off unless the
    // caller passes summary:true.
    let summaryFields = {};
    if (summary === true) {
      const delivery = describeBodyDelivery(doc.body, { maxLen: 200 });
      if (delivery.info.truncated) summaryTruncatedSlugs.push(doc.slug);
      summaryFields = {
        summary: delivery.text,
        ...(delivery.info.truncated ? { summaryTruncated: true } : {}),
      };
    }
    return {
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      domain: doc.frontmatter.domain,
      capabilities: doc.frontmatter.capabilities,
      elements: doc.frontmatter.elements,
      // Per-node mtime (ms), so a list response alone answers "which nodes
      // changed recently". Same meaning as get_concepts' mtime field: sortable,
      // and usable for external-change detection.
      mtime: doc.mtime,
      ...(matchedIn === undefined ? {} : { matchedIn, score }),
      ...summaryFields,
    };
  });
  return {
    total: filtered.length,
    census: vaultCensus(),
    vaultRoot: VAULT_ROOT,
    ...(filter === undefined ? {} : { filter, parsedAs: parsedFilter.repr }),
    ...(mentions === undefined ? {} : { query: mentions }),
    nodes,
    returned: nodes.length,
    limited: offset + nodes.length < filtered.length,
    pagination: {
      offset,
      limit,
      total: filtered.length,
      returned: nodes.length,
      hasMore: offset + nodes.length < filtered.length,
      nextOffset: offset + nodes.length < filtered.length ? offset + nodes.length : null,
    },
    // A truncated summary is marked on the row and explained once for the list, so the
    // caller can tell what is missing without a per-row notice.
    summaryHint:
      summaryTruncatedSlugs.length > 0
        ? `${summaryTruncatedSlugs.length} row(s) carry a partial summary (summaryTruncated: true). Read those bodies in full with get_concepts({ slugs: [...], body: "full" }).`
        : undefined,
    vaultWarnings:
      errorCount + warningCount > 0
        ? { errorCount, warningCount }
        : undefined,
    ...(filtered.length === 0
      ? zeroRowsGrowthHint({ docs, narrowed, selected, mentions, filter })
      : {}),
  };
}

/**
 * Nodes that mention `text`, best first. Relevance: title > frontmatter ref > body plus
 * title token overlap; a score above 0 exactly when a substring matched. The body counts
 * only when title and frontmatter did not match, and is read only when its fingerprint
 * allows the text and no earlier call answered it (`docBodyIncluder`).
 */
function rankByMentions(docs, text) {
  const needle = String(text).toLowerCase().trim();
  const bodyIncludes = docBodyIncluder(needle);
  const scored = [];
  for (const doc of docs) {
    const docTitle = String(doc.frontmatter.title || doc.frontmatter.name || '');
    // capabilities/elements joined with \n so a needle can't false-match across the field boundary.
    const frontmatterHaystack = `${String(doc.frontmatter.capabilities ?? '')}\n${String(doc.frontmatter.elements ?? '')}`;
    let { score, matchedIn } = scoreEvidence(text, { title: docTitle, frontmatterHaystack, body: '' });
    if (score <= 0) {
      if (!bodyIncludes(doc)) continue;
      ({ score, matchedIn } = scoreEvidence(text, { title: docTitle, frontmatterHaystack, bodyIncludes: true }));
    }
    if (score <= 0) continue;
    scored.push({ doc, matchedIn, score });
  }
  return scored.sort((a, b) => b.score - a.score || compareText(a.doc.slug, b.doc.slug));
}

/**
 * Zero rows is an unanswered question, so the answer says which part of it matched
 * nothing: a `filter` aimed at a kind or domain the vault does not have, or a mention no
 * title says. Plain `kind` / `domain` / `since` narrowing carries no hint.
 */
function zeroRowsGrowthHint({ docs, narrowed, selected, mentions, filter }) {
  if (mentions !== undefined && (filter === undefined || selected.length > 0)) {
    const candidates = narrowed.map((doc) => ({
      slug: doc.slug,
      title: String(doc.frontmatter.title || doc.frontmatter.name || doc.slug),
    }));
    return { growthHint: buildMentionsZeroHitsGrowthHint({ text: mentions, nearMatches: findNearTitleMatches(mentions, candidates) }) };
  }
  if (filter === undefined) return {};
  const byKind = Object.create(null);
  const byDomain = Object.create(null);
  for (const doc of docs) {
    const kind = doc.frontmatter?.kind;
    if (kind) byKind[kind] = (byKind[kind] ?? 0) + 1;
    const domain = doc.frontmatter?.domain;
    if (typeof domain === 'string' && domain) byDomain[domain] = (byDomain[domain] ?? 0) + 1;
  }
  return { growthHint: buildFilterZeroRowsGrowthHint({ filter, byKind, byDomain }) };
}

function getConcept({ slug, uid, body }, context = {}) {
  const hasSlug = slug !== undefined;
  const hasUid = uid !== undefined;
  if (hasSlug === hasUid) {
    throw new Error('get_concept requires exactly one of slug or uid.');
  }
  if (hasSlug) requireNonBlankString(slug, 'slug');
  if (hasUid) {
    requireNonBlankString(uid, 'uid');
    const issue = nodeUidIssue(uid);
    if (issue) throw new Error(issue);
  }
  const bodyMode = requireBodyMode(body);
  const docs = context.docs ?? loadVaultDocs(VAULT_ROOT);
  const canonicalSlug = hasUid
    ? (context.resolveUid ? context.resolveUid(uid) : resolveExistingVaultUid(uid, docs))
    : resolveExistingVaultSlug(slug, docs);
  if (!canonicalSlug) {
    if (hasUid) throw uidNotFoundError(uid);
    throw docNotFoundError(slug, docs);
  }
  let doc;
  try {
    doc = readDoc(VAULT_ROOT, slugToPath(VAULT_ROOT, canonicalSlug));
  } catch (err) {
    // Surface fs errors (ENOENT and friends) as a user-friendly message so
    // absolute paths do not leak.
    if (err && (err.code === 'ENOENT' || /no such file/i.test(err.message))) {
      if (hasUid) throw uidNotFoundError(uid);
      throw docNotFoundError(slug);
    }
    throw err;
  }
  // Detects frontmatter corruption in this doc, so an agent can report the
  // warnings and recommend vault:validate.
  const validation = doc.raw ? validateVaultDocument(doc.raw) : null;
  const warnings = validation ? [...validation.issues] : [];
  // Warn when the document is outside the graph: a vault holds ordinary notes by
  // design, and `get_concept`'s name alone would assert this is a concept. Reading
  // them stays allowed; refusing would break the local-first promise.
  const isNode =
    typeof doc.frontmatter?.kind === 'string' && doc.frontmatter.kind.trim() !== '';
  if (!isNode) {
    warnings.push({
      code: 'not-a-graph-node',
      severity: 'warning',
      message:
        'This doc is not a graph node — it has no `kind:`, so it has no relations, no UID, and never appears on the map. ' +
        'Ordinary markdown (meeting notes, memos, drafts) lives in the same folder by design. ' +
        'Cite it as a note, not as graph evidence. To promote it, add a `kind:` or use absorb_document.',
    });
  }
  const danglingIssuesBySlug =
    context.danglingIssuesBySlug ??
    groupDanglingIssuesBySlug(docs, new Set([doc.slug]));
  warnings.push(...(danglingIssuesBySlug.get(doc.slug) ?? []));
  // `rationale` is the document's own `relation_notes` sentence for that target,
  // present only when one is stored — the same optional field `find_path` and
  // `query_ontology` edges carry, so an agent reads what `add_relation(why)` wrote.
  const outgoingEdges = collectNeighborRefs(doc).map(({ key, ref }) => {
    const rationale = relationNoteFor(doc, ref);
    return rationale === undefined ? { to: ref, via: key } : { to: ref, via: key, rationale };
  });
  // Even excerpt mode carries the original length and the withheld character count,
  // so the caller knows there is more and can ask again.
  const delivery = describeBodyDelivery(doc.body, {
    mode: bodyMode,
    hint:
      bodyMode === 'full'
        ? `Body exceeds the ${FULL_BODY_MAX_CHARS}-char single-call cap — read the file directly for the remainder.`
        : `Only the first prose paragraph was returned. Call get_concepts({ slugs: ["${doc.slug}"], body: "full" }) for the whole body (definition / evidence / confidence / in-scope-out-of-scope sections live there).`,
  });
  return {
    uid: doc.frontmatter.uid,
    slug: doc.slug,
    isNode,
    frontmatter: doc.frontmatter,
    // `full` drops `excerpt` and ships `body` alone — sending the same text twice
    // bills a caller who explicitly asked for everything for up to 800 duplicate
    // characters.
    ...(bodyMode === 'full'
      ? { body: delivery.text }
      : { excerpt: delivery.text }),
    bodyInfo: delivery.info,
    neighbors: {
      domains: doc.frontmatter.domains || [],
      domain: doc.frontmatter.domain || null,
      capabilities: doc.frontmatter.capabilities || [],
      elements: doc.frontmatter.elements || [],
      // Alias-aware: a `depends_on:`-authored edge must appear here too, or this
      // block contradicts the outgoingEdges list built from the same document.
      dependencies: normalizeRelationRefs(relationRefsFor(doc, 'dependencies')),
      relates: doc.frontmatter.relates || [],
      contains: doc.frontmatter.contains || [],
      describes: doc.frontmatter.describes || [],
    },
    outgoingEdges,
    review: describeReview(doc),
    // In a read-modify-write flow the caller passes this straight through as the
    // `expected_mtime` of a later patch_concept / delete_concept, which is what
    // makes external-change detection work. Filesystem mtime, in ms.
    mtime: doc.mtime,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function getConceptsBatch({ slugs, uids, body }) {
  const hasSlugs = slugs !== undefined;
  const hasUids = uids !== undefined;
  if (hasSlugs === hasUids) {
    throw new Error('get_concepts requires exactly one of slugs or uids.');
  }
  const selectors = hasUids ? uids : slugs;
  const selectorName = hasUids ? 'uids' : 'slugs';
  if (!Array.isArray(selectors)) {
    throw new Error(`${selectorName} must be an array of strings`);
  }
  const bodyMode = requireBodyMode(body);
  if (selectors.length === 0) {
    return { concepts: [] };
  }
  if (selectors.length > 50) {
    throw new Error(
      `Too many ${selectorName}: ${selectors.length}. Max 50 per call — split into multiple get_concepts batches.`
    );
  }
  if (bodyMode === 'full' && selectors.length > GET_CONCEPTS_FULL_BODY_MAX) {
    throw new Error(
      `Too many ${selectorName} for body:"full": ${selectors.length}. Max ${GET_CONCEPTS_FULL_BODY_MAX} per call — split into multiple get_concepts batches, or drop body:"full" to read ${selectors.length} excerpts at once.`
    );
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const context = indexedBatchReadContext(docs, selectors, hasUids);
  const concepts = selectors.map((selector) => {
    try {
      requireNonBlankString(selector, hasUids ? 'uid' : 'slug');
      const result = getConcept(
        hasUids ? { uid: selector, body: bodyMode } : { slug: selector, body: bodyMode },
        context,
      );
      return { ok: true, ...result };
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const repairFields = err && typeof err === 'object' && err.repairFields
        ? err.repairFields
        : {};
      const growthHint = err && typeof err === 'object' ? err.growthHint : undefined;
      // Surface the friendly message ("Doc not found") as-is; no absolute path leak.
      return {
        ...(hasUids ? { uid: selector } : { slug: selector }),
        ok: false,
        error: msg,
        ...structuredRowErrorDetails(err, msg),
        ...repairFields,
        ...(growthHint ? { growthHint } : {}),
      };
    }
  });
  return { concepts };
}

/**
 * The long-form rules a truncating host never delivers. Tool descriptions and
 * results arrive whole, so this map is the reliable channel: one topic per
 * section, each pointing at the constant the instructions interpolate.
 */
const CONSTRUCTION_GUIDE_TEXT = {
  meta_model: META_MODEL_RULES_EN,
  construction: CONSTRUCTION_GUIDE_EN,
  write_safety: WRITE_SAFETY_SECTION_EN,
  workflows: WORKFLOWS_SECTION_EN,
  competency: COMPETENCY_ANSWERS_GUIDE_EN,
};

function connectionInfoTool({ guide } = {}) {
  requireOptionalEnum(guide, 'guide', [...CONSTRUCTION_GUIDE_TOPICS]);
  const toolNames = TOOLS_FOR_LIST.map((tool) => tool.name);
  const toolsetHash = createHash('sha256')
    .update(JSON.stringify(TOOLS_FOR_LIST))
    .digest('hex');
  const result = {
    vaultRoot: VAULT_ROOT,
    repoRoot: REPO_ROOT,
    vaultResolution: VAULT_RESOLUTION,
    repoResolution: REPO_RESOLUTION,
    sameRoot: VAULT_ROOT === REPO_ROOT,
    restartRequiredForRootChange: true,
    server: {
      name: 'ontology-atlas-mcp',
      version: SERVER_VERSION,
      readOnly: READ_ONLY_MODE,
      toolCount: toolNames.length,
      toolNames,
      toolsetHash,
    },
    guide: {
      card: CONSTRUCTION_CARD_EN,
      topics: [...CONSTRUCTION_GUIDE_TOPICS],
    },
  };
  if (guide !== undefined) {
    result.guideText = CONSTRUCTION_GUIDE_TEXT[guide];
  }
  return result;
}

function findBacklinksTool({ slug }) {
  requireNonBlankString(slug, 'slug');
  const matches = findBacklinks(VAULT_ROOT, slug).sort((left, right) => (left.slug < right.slug ? -1 : 1));
  return { target: slug, total: matches.length, matches };
}

function findNeighborsTool({ slug, direction = 'both', types, includeNodes = true, limit = 100 }) {
  requireNonBlankString(slug, 'slug');
  requireOptionalDirection(direction, 'direction', ['outgoing', 'incoming', 'both']);
  requireOptionalRelationTypeArray(types, 'types');
  requireOptionalBoolean(includeNodes, 'includeNodes');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);
  const center = resolveExistingVaultSlug(slug, docs);
  if (!center) {
    throw new Error(`Doc not found: ${slug}`);
  }
  const docBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const centerDoc = docBySlug.get(center);
  const typeSet = Array.isArray(types) && types.length > 0
    ? new Set(types.map(normalizeGraphRelationKey).filter(Boolean))
    : null;
  const edgeLimit = limit;
  const edges = [];
  const seen = new Set();
  const pushEdge = (edge) => {
    if (typeSet && !typeSet.has(edge.via)) return;
    const key = `${edge.direction}\0${edge.from}\0${edge.to}\0${edge.via}\0${edge.ref || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push(edge);
  };

  if (direction === 'outgoing' || direction === 'both') {
    for (const { key, ref } of collectNeighborRefs(centerDoc)) {
      const resolved = resolveGraphRef(ref, docs);
      pushEdge({
        direction: 'outgoing',
        from: center,
        to: resolved.slug || ref,
        via: key,
        ref,
        resolved: Boolean(resolved.slug),
        ...(resolved.error ? { unresolvedReason: resolved.error } : {}),
      });
    }
  }

  if (direction === 'incoming' || direction === 'both') {
    for (const doc of docs) {
      if (doc.slug === center) continue;
      for (const { key, ref } of collectNeighborRefs(doc)) {
        const resolved = resolveGraphRef(ref, docs);
        if (resolved.slug !== center) continue;
        pushEdge({
          direction: 'incoming',
          from: doc.slug,
          to: center,
          via: key,
          ref,
          resolved: true,
        });
      }
    }
  }

  edges.sort((a, b) =>
    compareText(`${a.direction}:${a.via}:${a.from}:${a.to}`, `${b.direction}:${b.via}:${b.from}:${b.to}`)
  );
  const limitedEdges = edges.slice(0, edgeLimit);
  const neighborSlugs = new Set();
  for (const edge of limitedEdges) {
    if (edge.resolved && edge.from !== center) neighborSlugs.add(edge.from);
    if (edge.resolved && edge.to !== center) neighborSlugs.add(edge.to);
  }

  return {
    center,
    requested: slug,
    direction,
    types: typeSet ? [...typeSet].sort() : undefined,
    totalEdges: edges.length,
    limited: edges.length > limitedEdges.length,
    edges: limitedEdges,
    nodes:
      includeNodes === false
        ? undefined
        : [...neighborSlugs].sort().map((neighborSlug) => summarizeDoc(docBySlug.get(neighborSlug))),
  };
}

function summarizeDoc(doc) {
  return {
    uid: doc.frontmatter.uid,
    slug: doc.slug,
    kind: doc.frontmatter.kind,
    title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
    domain: doc.frontmatter.domain,
    mtime: doc.mtime,
  };
}

function resolveGraphRef(ref, docs) {
  try {
    return { slug: resolveExistingVaultSlug(ref, docs) };
  } catch (err) {
    return { slug: null, error: err && err.message ? err.message : String(err) };
  }
}

function findPathTool({ from, to, maxHops }) {
  requireNonBlankString(from, 'from');
  requireNonBlankString(to, 'to');
  requireOptionalNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const result = findPath(VAULT_ROOT, from, to, maxHops ?? 5);
  if (!result) {
    // A zero-path answer checks whether both endpoints exist, so a missing endpoint
    // (suggest add_concept) is told apart from no path between existing ones (suggest
    // add_relation).
    const docs = loadVaultDocs(VAULT_ROOT);
    const fromExists = Boolean(resolveGraphRef(from, docs).slug);
    const toExists = Boolean(resolveGraphRef(to, docs).slug);
    return {
      from,
      to,
      found: false,
      reason: 'no path found (or maxHops exceeded)',
      growthHint: buildFindPathGrowthHint({ from, to, fromExists, toExists }),
    };
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const docsBySlug = new Map(docs.map((doc) => [doc.slug, doc]));
  const nodes = result.hops.map((slug) => summarizePathNode(docsBySlug.get(slug), slug));
  return { ...result, nodes, found: true, hopCount: result.hops.length - 1 };
}

function summarizePathNode(doc, slug) {
  if (!doc) {
    return { slug, kind: 'unknown', title: slug };
  }
  const frontmatter = doc.frontmatter || {};
  const summary = {
    uid: frontmatter.uid,
    slug: doc.slug || slug,
    kind: String(frontmatter.kind || 'document'),
    title: String(frontmatter.title || frontmatter.name || doc.slug || slug),
  };
  if (typeof frontmatter.domain === 'string') {
    summary.domain = frontmatter.domain;
  }
  return summary;
}

function listKindsTool() {
  const result = listKinds(VAULT_ROOT);
  return { ...result, byKind: Object.fromEntries(Object.entries(result.byKind).sort(([left], [right]) => (left < right ? -1 : 1))) };
}

function vaultCensus() {
  const { total, byKind, referencedOnlyTotal } = listKindsTool();
  return { total, byKind, referencedOnlyTotal };
}

const READ_SOURCE_REFUSALS = {
  symlink_path: 'is a symbolic link or sits under one. read_source reads only regular files inside the vault\'s `sources/` folder, so a link cannot hand it a file from elsewhere on the disk. Copy the document into `sources/` instead of linking it.',
  non_regular_file: 'is not a regular file. Name one document file under `sources/`.',
  file_too_large: `is larger than ${READ_SOURCE_MAX_FILE_BYTES / 1024 / 1024} MiB, the most read_source reads at once. Split the document, or cite a PDF by page from your own reader.`,
  outside_root: 'resolves outside the vault\'s `sources/` folder.',
  not_found: 'is not in this folder. `validate_wiki` lists the sources every page cites.',
  file_changed: 'changed while it was being read. Read it again.',
  unsafe_read: 'could not be opened as a readable regular file. Check its permissions.',
  sensitive_path: 'is a hidden file or has a credential-like name (secret, credentials, *.pem, *.key), which a vault read never opens. Rename the document if it is neither.',
};

/**
 * The text of one raw source, in citable units — `read_source`. Every path segment is checked
 * first (under `sources/`, no symbolic link, inside the vault); the bytes are hashed as read,
 * the same `source_hash` a page records.
 */
function readSourceTool({ path, from, limit, sheet } = {}) {
  const relPath = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relPath.startsWith('sources/') && relPath && !relPath.split('/').includes('..')) {
    // A repository path, not a vault source: the refusal names the tool that reads
    // repository code, in the shape that call takes, so the next read still happens.
    const quoted = JSON.stringify(relPath);
    throw new Error(
      `read_source: \`${relPath}\` is repository code, and read_source reads only the documents in ` +
        "the vault's `sources/` folder (for example `sources/plan.docx`). Read repository code with " +
        `analyze_repo_structure({ sourceReads: [{ path: ${quoted}, mode: "outline" }] }) for its ` +
        `declarations with line numbers, then { path: ${quoted}, startLine: <n>, maxLines: <at most 200> } ` +
        'for the exact lines.',
    );
  }
  if (!relPath.startsWith('sources/') || relPath.split('/').includes('..') || relPath.endsWith('/')) {
    throw new Error('read_source: `path` must name a file under `sources/`, such as `sources/plan.docx`.');
  }
  const read = namesHiddenOrCredentialFile(relPath)
    ? { reason: 'sensitive_path' }
    : readStableFile(VAULT_ROOT, relPath, { maxBytes: READ_SOURCE_MAX_FILE_BYTES });
  if (read.reason) throw new Error(`read_source: \`${relPath}\` ${READ_SOURCE_REFUSALS[read.reason]}`);
  const answer = readSourceText(read.bytes, relPath, { from, limit, sheet });
  answer.sha256 = createHash('sha256').update(read.bytes).digest('hex');
  return answer;
}

export {
  listConcepts,
  getConcept,
  getConceptsBatch,
  connectionInfoTool,
  findBacklinksTool,
  findNeighborsTool,
  findPathTool,
  listKindsTool,
  readSourceTool,
};
