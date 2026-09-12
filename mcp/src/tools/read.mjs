/**
 * The side-effect-free vault reads: connection facts, listing and fetching
 * concepts, prose evidence, backlinks, neighbors, paths, kinds, orphans,
 * filtered queries, and source passages.
 */
import { scoreEvidence } from '../evidence-rank.mjs';
import {
  buildFindEvidenceZeroHitsGrowthHint,
  buildFindPathGrowthHint,
  buildQueryConceptsZeroRowsGrowthHint,
  findNearTitleMatches,
} from '../growth-hint.mjs';
import { NODE_KIND_VALUES } from '../ontology-engine.mjs';
import { parseFilter } from '../query.mjs';
import { nodeUidIssue } from '../schema.mjs';
import { SERVER_VERSION } from '../server-version.mjs';
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
  requireOptionalNodeKindArray,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalNonNegativeNumber,
  requireOptionalPositiveInteger,
  requireOptionalRelationTypeArray,
} from '../server/validate.mjs';
import { readSourceText } from '../source-text.mjs';
import {
  suppressLibraryKindIssues,
  suppressParentedExpectedFieldIssues,
  validateVaultDocument,
} from '../validate.mjs';
import {
  FULL_BODY_MAX_CHARS,
  GET_CONCEPTS_FULL_BODY_MAX,
  collectNeighborRefs,
  describeBodyDelivery,
  findBacklinks,
  findOrphans,
  findPath,
  listKinds,
  loadVaultDocs,
  normalizeRelationRefs,
  readDoc,
  relationNoteFor,
  slugToPath,
} from '../vault.mjs';
import { groupDanglingIssuesBySlug } from './validate-vault.mjs';
import {
  describeReview,
  docNotFoundError,
  resolveExistingVaultSlug,
  resolveExistingVaultUid,
  uidNotFoundError,
} from './vault-nodes.mjs';
import {
  RELATION_KEY,
  relationRefsFor,
} from './write-relations.mjs';
import { createHash } from 'node:crypto';
import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import {
  join,
  resolve,
  sep,
} from 'node:path';

function listConcepts({ kind, domain, since, summary, offset = 0, limit = 100 }) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNonBlankString(domain, 'domain');
  requireOptionalNonNegativeNumber(since, 'since');
  requireOptionalBoolean(summary, 'summary');
  requireOptionalNonNegativeInteger(offset, 'offset');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const docs = loadVaultDocs(VAULT_ROOT);

  // Vault-wide validation counts. Every raw doc is validated so silent
  // corruption becomes visible, and an agent sees the vault's state in one call.
  let errorCount = 0;
  let warningCount = 0;
  /*
   * ⚠️ **Narrow before aggregating** (2026-08-11). This number is
   * `list_concepts.vaultWarnings`, and `mcp-verify` fails when it is non-zero. A
   * freshly created vault was reported as "connection failed" for exactly that
   * reason: the warning was "no parent" while the project already contained the
   * node. Grouping by slug before counting is what makes containment visible.
   */
  const issuesBySlugForCount = new Map();
  for (const doc of docs) {
    if (!doc.raw) continue;
    const report = validateVaultDocument(doc.raw);
    if (report.issues.length > 0) issuesBySlugForCount.set(doc.slug, [...report.issues]);
  }
  for (const [slug, issues] of groupDanglingIssuesBySlug(docs)) {
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

  // When `since` (ms) is a number, only docs with mtime > since pass. Agents use
  // it for incremental sync: capture the maximum mtime from a previous list
  // response, pass it as `since`, receive only what changed. Equal mtimes are
  // excluded strictly, so resending the max never double-fetches.
  const sinceMs = typeof since === 'number' && Number.isFinite(since) ? since : null;
  const filtered = docs.filter((doc) => {
    const docKind = doc.frontmatter.kind;
    if (kind && docKind !== kind) return false;
    if (!docKind) return false; // A frontmatter `kind:` is what makes it an ontology node.
    // Domain filter — matches frontmatter `domain:`. Answers the common query
    // ("every capability in the auth domain") in one call without the
    // query_concepts DSL. Applied uniformly across kinds; no match simply yields
    // an empty result.
    if (domain && doc.frontmatter.domain !== domain) return false;
    if (sinceMs !== null && (typeof doc.mtime !== 'number' || doc.mtime <= sinceMs)) return false;
    return true;
  }).sort((a, b) => a.slug.localeCompare(b.slug));
  if (offset > filtered.length) {
    throw new Error(
      `offset must be less than or equal to the total matching nodes (${filtered.length}); Received: ${offset}.`,
    );
  }
  const page = filtered.slice(offset, offset + limit);
  const summaryTruncatedSlugs = [];
  const nodes = page.map((doc) => {
    // Opt-in summary, so one list call answers "what is each node about?".
    // Capped at 200 chars to keep the payload from ballooning (same cap as
    // find_evidence). Off unless the caller passes summary:true.
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
      // changed recently". Same meaning as get_concept's mtime field: sortable,
      // and usable for external-change detection.
      mtime: doc.mtime,
      ...summaryFields,
    };
  });
  return {
    total: filtered.length,
    vaultRoot: VAULT_ROOT,
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
    // A truncated summary is **marked on the row and explained once for the
    // list**. Repeating the notice per row only grows the payload; omitting it
    // entirely leaves the caller unable to tell what is missing, so it cannot
    // ask again.
    summaryHint:
      summaryTruncatedSlugs.length > 0
        ? `${summaryTruncatedSlugs.length} row(s) carry a partial summary (summaryTruncated: true). Read those bodies in full with get_concepts({ slugs: [...], body: "full" }).`
        : undefined,
    vaultWarnings:
      errorCount + warningCount > 0
        ? { errorCount, warningCount }
        : undefined,
  };
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
    ? resolveExistingVaultUid(uid, docs)
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
  /*
   * ⚠️ **Say so when the document is outside the graph** (measured 2026-08-08).
   *
   * A vault is an ordinary markdown folder, so meeting notes, memos, and drafts
   * live alongside nodes by design. But this tool is named `get_concept`, so the
   * response itself asserts "this is a concept". Previously a memo with no
   * frontmatter at all carried **no warning whatsoever** (while a doc missing only
   * `kind:` got `missing-kind`) — the most common case had the least signal.
   *
   * Do not reject it: reading a person's notes is legitimate, and blocking it
   * would break the local-first promise. Say what is being handed over instead.
   */
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
    groupDanglingIssuesBySlug(context.docs ?? loadVaultDocs(VAULT_ROOT));
  warnings.push(...(danglingIssuesBySlug.get(doc.slug) ?? []));
  // `rationale` is the document's own `relation_notes` sentence for that target,
  // present only when one is stored — the same optional field `find_path` and
  // `query_ontology` edges carry, so an agent reads what `add_relation(why)` wrote.
  const outgoingEdges = collectNeighborRefs(doc).map(({ key, ref }) => {
    const rationale = relationNoteFor(doc, ref);
    return rationale === undefined ? { to: ref, via: key } : { to: ref, via: key, rationale };
  });
  // **Say that it was truncated.** Even excerpt mode must carry the original
  // length and the number of characters withheld, so the caller knows there is
  // more and can ask again. It used to cut silently, and an agent handed only the
  // vault answered "it might exist but I could not confirm".
  const delivery = describeBodyDelivery(doc.body, {
    mode: bodyMode,
    hint:
      bodyMode === 'full'
        ? `Body exceeds the ${FULL_BODY_MAX_CHARS}-char single-call cap — read the file directly for the remainder.`
        : `Only the first prose paragraph was returned. Call get_concept({ slug: "${doc.slug}", body: "full" }) for the whole body (definition / evidence / confidence / in-scope-out-of-scope sections live there).`,
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

// Batch variant of get_concept. Input `slugs[]` order is preserved, and a missing
// slug surfaces as an `{ ok: false, error }` row instead of aborting the batch, so
// an agent gets a partial result (reusing a list_concepts result without
// revalidating does not kill the whole batch over one or two stale slugs). The cap
// of 50 keeps the payload bounded; larger vaults chunk the call.
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
  // Full bodies grow the per-row payload by an order of magnitude. 50 rows × full
  // body is not one response — it is several calls, so the cap drops and says so.
  if (bodyMode === 'full' && selectors.length > GET_CONCEPTS_FULL_BODY_MAX) {
    throw new Error(
      `Too many ${selectorName} for body:"full": ${selectors.length}. Max ${GET_CONCEPTS_FULL_BODY_MAX} per call — split into multiple get_concepts batches, or drop body:"full" to read ${selectors.length} excerpts at once.`
    );
  }
  const docs = loadVaultDocs(VAULT_ROOT);
  const danglingIssuesBySlug = groupDanglingIssuesBySlug(docs);
  const concepts = selectors.map((selector) => {
    try {
      requireNonBlankString(selector, hasUids ? 'uid' : 'slug');
      const result = getConcept(
        hasUids ? { uid: selector, body: bodyMode } : { slug: selector, body: bodyMode },
        { docs, danglingIssuesBySlug },
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

function findEvidence({ title, limit, nodesOnly = false } = {}) {
  requireNonBlankString(title, 'title');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  requireOptionalBoolean(nodesOnly, 'nodesOnly');
  const docs = loadVaultDocs(VAULT_ROOT);
  const matches = [];
  for (const doc of docs) {
    const docTitle = String(doc.frontmatter.title || doc.frontmatter.name || '');
    // capabilities/elements joined with \n so a needle can't false-match across
    // the field boundary — keeps inclusion identical to the prior per-field sweep.
    const frontmatterHaystack = `${String(doc.frontmatter.capabilities ?? '')}\n${String(doc.frontmatter.elements ?? '')}`;
    // Atlas Track A #4 — relevance score (title > frontmatter ref > body + title
    // token-overlap). Inclusion unchanged: score>0 ⟺ a substring matched.
    const { score, matchedIn } = scoreEvidence(title, {
      title: docTitle,
      frontmatterHaystack,
      body: doc.body,
    });
    if (score <= 0) continue;
    // Match excerpts get truncated too — and find_evidence can match *inside* the
    // body, so without saying it was cut, the very sentence that matched can be
    // absent from the response. The two fields appear only when truncated.
    const evidenceDelivery = describeBodyDelivery(doc.body, { maxLen: 200 });
    // ⚠️ **The row states whether it is a node** (2026-08-08).
    // Markdown that is not a node (meeting notes, memos, drafts) legitimately
    // lives in a vault. That used to be expressed only as «the `kind` key is
    // absent», and an absent key disappears from JSON — which is **no signal at
    // all** to the reader. Agents were reading memos as nodes and citing them.
    const isNode = typeof doc.frontmatter.kind === 'string' && doc.frontmatter.kind.trim() !== '';
    if (nodesOnly && !isNode) continue;
    matches.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      isNode,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // Same shape as list_concepts / find_backlinks / find_orphans /
      // query_concepts, so an agent reuses one sort/filter path across every
      // read tool.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
      matchedIn,
      score,
      // One-line prose summary of the matched doc (max 200 chars) so an agent
      // knows what a match is about without a follow-up get_concept. Same
      // prose-aware extraction as get_concept's 800-char helper, shorter cap.
      excerpt: evidenceDelivery.text,
      ...(evidenceDelivery.info.truncated
        ? {
            excerptTruncated: true,
            bodyChars: evidenceDelivery.info.totalChars,
          }
        : {}),
    });
  }
  /*
   * Best match first: score desc → **nodes before non-nodes** → slug asc.
   *
   * The middle key was added 2026-08-08. Body matches all score identically
   * (0.3), so sorting on score alone left slug alphabetisation as the only
   * tiebreak — in a vault of 3,000 loose documents the top five were all memos
   * and not one real node appeared (measured).
   *
   * It never beats score. A memo whose title matches exactly (0.75+) still ranks
   * above a node grazed in the body (0.3) — a person's memo is sometimes the real
   * evidence, and hiding it would break this product's promise. Only the handling
   * of ties changed.
   */
  matches.sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.isNode) - Number(a.isNode) ||
      a.slug.localeCompare(b.slug),
  );
  const limited = typeof limit === 'number' ? matches.slice(0, limit) : matches;
  const result = { query: title, matches: limited };
  // When loose documents came back in the results, say so and give the way to
  // narrow it — rather than filtering silently, hand the reader what they need to
  // judge for themselves.
  const nonNodeCount = limited.filter((m) => !m.isNode).length;
  if (nonNodeCount > 0) {
    result.nonNodeHint =
      `${nonNodeCount} of ${limited.length} match(es) are not graph nodes (no \`kind:\` — meeting notes, memos, drafts ` +
      `live in the same folder by design). They are ranked below nodes of equal relevance. ` +
      `Pass nodesOnly: true to see only graph nodes.`;
  }
  const truncatedSlugs = limited.filter((m) => m.excerptTruncated).map((m) => m.slug);
  if (truncatedSlugs.length > 0) {
    result.bodyHint = `${truncatedSlugs.length} of ${limited.length} match(es) returned a partial excerpt — the matched text may sit past it. Read the whole body with get_concepts({ slugs: [${truncatedSlugs
      .slice(0, 3)
      .map((s) => `"${s}"`)
      .join(', ')}${truncatedSlugs.length > 3 ? ', …' : ''}], body: "full" }).`;
  }
  // Zero hits is an unanswered question. Substring matching already failed (every
  // score <= 0), so near-miss titles are found by token overlap alone.
  if (matches.length === 0) {
    const candidates = docs.map((doc) => ({
      slug: doc.slug,
      title: String(doc.frontmatter.title || doc.frontmatter.name || doc.slug),
    }));
    const nearMatches = findNearTitleMatches(title, candidates);
    result.growthHint = buildFindEvidenceZeroHitsGrowthHint({ title, nearMatches });
  }
  return result;
}

function connectionInfoTool() {
  const toolNames = TOOLS_FOR_LIST.map((tool) => tool.name);
  const toolsetHash = createHash('sha256')
    .update(JSON.stringify(TOOLS_FOR_LIST))
    .digest('hex');
  return {
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
  };
}

function findBacklinksTool({ slug }) {
  requireNonBlankString(slug, 'slug');
  const matches = findBacklinks(VAULT_ROOT, slug);
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
    `${a.direction}:${a.via}:${a.from}:${a.to}`.localeCompare(
      `${b.direction}:${b.via}:${b.from}:${b.to}`,
    )
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

function normalizeGraphRelationKey(type) {
  if (typeof type !== 'string') return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  return RELATION_KEY[trimmed] || trimmed;
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
    // A zero-path answer is an unanswered question. Check first whether both
    // endpoints actually exist in the vault, so "the endpoint itself is missing"
    // (suggest add_concept) is distinguished from "both exist but no path"
    // (suggest add_relation).
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
  return listKinds(VAULT_ROOT);
}

function findOrphansTool({ kind, excludeKinds } = {}) {
  requireOptionalNonBlankString(kind, 'kind');
  requireOptionalEnum(kind, 'kind', NODE_KIND_VALUES);
  requireOptionalNodeKindArray(excludeKinds, 'excludeKinds');
  return findOrphans(VAULT_ROOT, {
    kind: typeof kind === 'string' ? kind : undefined,
    excludeKinds: Array.isArray(excludeKinds) ? excludeKinds : undefined,
  });
}

function queryConceptsTool({ filter, limit }) {
  requireNonBlankString(filter, 'filter');
  requireOptionalPositiveInteger(limit, 'limit', { max: 500 });
  const parsed = parseFilter(filter);
  const cap = limit ?? 100;
  const docs = loadVaultDocs(VAULT_ROOT).filter((d) => Boolean(d.frontmatter?.kind));
  const matches = [];
  let total = 0;
  for (const doc of docs) {
    if (!parsed.match(doc)) continue;
    total += 1;
    if (matches.length < cap) {
      matches.push({
        uid: doc.frontmatter.uid,
        slug: doc.slug,
        kind: doc.frontmatter.kind,
        title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
        domain: doc.frontmatter.domain,
        capabilities: doc.frontmatter.capabilities,
        elements: doc.frontmatter.elements,
        // Same shape as list_concepts / find_backlinks / find_orphans, so an agent
        // can sort or filter query results by staleness with no follow-up call.
        mtime: doc.mtime,
      });
    }
  }
  const result = {
    filter,
    parsedAs: parsed.repr,
    total,
    matches,
    limited: total > matches.length,
  };
  // Zero rows is an unanswered question. Check the real vault inventory
  // (byKind/byDomain) for whether the filter aimed at a kind or domain that does
  // not exist.
  if (total === 0) {
    const byKind = {};
    const byDomain = {};
    for (const doc of docs) {
      const kind = doc.frontmatter?.kind;
      if (kind) byKind[kind] = (byKind[kind] ?? 0) + 1;
      const domain = doc.frontmatter?.domain;
      if (typeof domain === 'string' && domain) byDomain[domain] = (byDomain[domain] ?? 0) + 1;
    }
    result.growthHint = buildQueryConceptsZeroRowsGrowthHint({ filter, byKind, byDomain });
  }
  return result;
}

/** Vault-relative paths under `sources/`. A listing, never a read. */
/**
 * The text of one raw source, in citable units — `read_source`.
 *
 * The path is checked before anything is opened: it must sit under `sources/` and resolve
 * inside the vault, so a request cannot read a file the folder does not hold. The bytes are
 * hashed as read, which is the same `source_hash` a page records.
 */
function readSourceTool({ path, from, limit, sheet } = {}) {
  const relPath = String(path ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!relPath.startsWith('sources/') || relPath.split('/').includes('..') || relPath.endsWith('/')) {
    throw new Error('read_source: `path` must name a file under `sources/`, such as `sources/plan.docx`.');
  }
  const absolute = resolve(VAULT_ROOT, relPath);
  if (!absolute.startsWith(resolve(VAULT_ROOT, 'sources') + sep)) {
    throw new Error('read_source: `path` must stay inside the vault\'s `sources/` folder.');
  }
  let buffer;
  try {
    buffer = readFileSync(absolute);
  } catch {
    throw new Error(`read_source: \`${relPath}\` is not in this folder. \`validate_wiki\` lists the sources every page cites.`);
  }
  const answer = readSourceText(buffer, relPath, { from, limit, sheet });
  answer.sha256 = createHash('sha256').update(buffer).digest('hex');
  return answer;
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

export {
  listConcepts,
  getConcept,
  getConceptsBatch,
  findEvidence,
  connectionInfoTool,
  findBacklinksTool,
  findNeighborsTool,
  normalizeGraphRelationKey,
  summarizeDoc,
  resolveGraphRef,
  findPathTool,
  summarizePathNode,
  listKindsTool,
  findOrphansTool,
  queryConceptsTool,
  readSourceTool,
  listVaultSourcePaths,
};
