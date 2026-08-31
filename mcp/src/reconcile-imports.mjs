// reconcile-imports — the set-diff between code-derived import edges and the
// vault's compiled `depends_on` edges.
//
// `inferImports()` already walks the source tree into folder-prefixed module
// edges (capabilities/X, elements/src/…), and `compileOntology()` already
// produces the vault's depends_on edges. They were never compared, so the agent
// got a 454-edge firehose and had to diff it in its head. This turns "here are
// all the imports" into "here is EXACTLY what to sync".
//
// Strictly read-only: it reports candidates only. The agent still lands changes
// through the existing confirmed add_relation tool, so the vault stays the single
// source of truth. Lives in the mcp/ package (no FSD or static-export surface).

/**
 * Diff code-derived import edges against compiled vault depends_on edges.
 *
 * @param {object} args
 * @param {Array<{from:string,to:string,count?:number}>} [args.moduleEdges]  inferImports().moduleEdges
 * @param {Array<{from:string,to:string,via?:string,ref?:string}>} [args.compiledEdges]  compileOntology().edges
 * @param {Map<string,string>|Record<string,string>} [args.aliasToSlug]  alias → canonical slug (compiler index)
 * @param {Set<string>|Array<string>} [args.nodeSlugs]  existing vault node slugs. When given, a code-missing edge
 *   whose endpoints are all real nodes goes to `inCodeMissingFromVault` (reviewable against existing concepts); one
 *   with a non-node endpoint (a folder-derived slug that isn't a vault node) goes to `inCodeMissingEndpointAbsent`
 *   (needs the nodes modelled first). Neither category is directly landable: an import is
 *   source evidence, not by itself a semantic ontology dependency.
 * @param {Record<string,string>|Map<string,string>} [args.pathBySlug]  slug → that node's `path:`.
 *   When given, edges whose implementation **the scanner cannot read** (C and other unsupported
 *   extensions, or an unknown path) are split out into `notJudgeableByImports`. Omit it and behaviour
 *   is unchanged.
 * @param {Set<string>|Array<string>} [args.scannedExtensions]  the extensions the scanner actually read
 *   (`inferImports().coverage.supportedExtensions`). Falls back to the default list.
 * @returns {{inBoth:Array,inCodeMissingFromVault:Array,inCodeMissingEndpointAbsent:Array,inVaultNotInCode:Array,notJudgeableByImports:Array}}
 */
// The compiler canonicalizes the `depends_on` frontmatter key to the stored
// relation key `dependencies` (NEIGHBOR_KEY_ALIASES in vault.mjs; the public
// API name is `depends_on`, the compiled `via` is `dependencies`). Match the
// compiled value — matching 'depends_on' alone silently swallows every real
// dependency edge. Accept both so a future alias can't break the contract.
const DEPENDS_ON_VIA = new Set(['dependencies', 'depends_on']);
/**
 * Default set of extensions the scanner reads — the same as `infer-imports`'s
 * `supportedExtensions`. The caller's actual value wins when supplied; it is
 * accepted precisely to stop the two drifting apart.
 */
const DEFAULT_SCANNED_EXTENSIONS = new Set([
  '.cjs', '.cts', '.go', '.js', '.jsx', '.mjs', '.mts', '.py', '.rs', '.ts', '.tsx',
]);

/**
 * Can the scanner **read** this endpoint's implementation?
 *
 * **Why this verdict is needed** (measured 2026-08-17 on this repository itself):
 * all three of our vault's `depends_on` edges came back as "absent from the code →
 * review as stale", and all three were correct relations. The scanner missed them
 * not because the relation was absent but because it **could not see it** —
 * a native C endpoint is outside the supported extension set, so its missing
 * import cannot be judged as stale evidence.
 *
 * **Reporting "did not see" as "does not exist" makes an agent delete a correct
 * relation.** This repository's CodeGraph rule already says the same thing:
 * *"never use 'not found' as evidence of absence."* So the verdict must be able
 * to defer.
 */
function readabilityOf(slug, pathMap, extensions) {
  if (!pathMap) return { readable: true, reason: null };
  const raw = pathMap instanceof Map ? pathMap.get(slug) : pathMap[slug];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { readable: false, reason: 'endpoint_path_unknown' };
  }
  const dot = raw.lastIndexOf('.');
  const slash = raw.lastIndexOf('/');
  // No extension means it points at a directory, which may hold files the scanner
  // does read — so do not conclude it is unreadable.
  if (dot <= slash) return { readable: true, reason: null };
  const ext = raw.slice(dot).toLowerCase();
  return extensions.has(ext)
    ? { readable: true, reason: null }
    : { readable: false, reason: 'endpoint_language_not_scanned' };
}

const SOURCE_ROLE_VALUES = ['production', 'test', 'unknown'];
const IMPORT_USAGE_VALUES = ['value', 'type_only', 'unknown'];

export function reconcileImportEdges({
  moduleEdges = [],
  compiledEdges = [],
  aliasToSlug,
  nodeSlugs,
  pathBySlug,
  scannedExtensions,
} = {}) {
  const extensions =
    scannedExtensions instanceof Set
      ? scannedExtensions
      : Array.isArray(scannedExtensions)
        ? new Set(scannedExtensions)
        : DEFAULT_SCANNED_EXTENSIONS;
  const nodeSet =
    nodeSlugs instanceof Set ? nodeSlugs : Array.isArray(nodeSlugs) ? new Set(nodeSlugs) : null;
  // Normalize through the compiler's alias map so an alias edge (alias-src→b)
  // and its canonical form (capabilities/a→capabilities/b) compare equal. The
  // compiled `to` is already alias-resolved; module-edge endpoints may not be.
  const norm = (s) => {
    if (s == null) return s;
    const hit = aliasToSlug instanceof Map ? aliasToSlug.get(s) : aliasToSlug?.[s];
    return hit ?? s;
  };
  // A NUL in the composite key would make this file binary to git (2026-08-08).
  const key = (from, to) => JSON.stringify([from, to]);

  // Vault side: depends_on edges only, normalized, self-edges dropped.
  const vaultMap = new Map();
  for (const e of compiledEdges) {
    if (!DEPENDS_ON_VIA.has(e?.via)) continue;
    const from = norm(e.from);
    const to = norm(e.to);
    if (!from || !to || from === to) continue;
    vaultMap.set(key(from, to), { from, to, ref: e.ref, via: e.via });
  }

  // Code side: normalized, self-edges dropped, alias-collapsed (sum counts and
  // retain a bounded exact source receipt for human review).
  const codeMap = new Map();
  for (const e of moduleEdges) {
    const from = norm(e.from);
    const to = norm(e.to);
    if (!from || !to || from === to) continue;
    const k = key(from, to);
    const prev = codeMap.get(k);
    const evidence = [...(prev?.evidence ?? [])];
    for (const row of e.evidence ?? []) {
      if (evidence.length >= 5) break;
      evidence.push(row);
    }
    codeMap.set(k, {
      from,
      to,
      count: (e.count ?? 0) + (prev?.count ?? 0),
      sourceRoleCounts: addCounts(
        prev?.sourceRoleCounts,
        normalizedCounts(e.sourceRoleCounts, SOURCE_ROLE_VALUES, e.count ?? 0),
        SOURCE_ROLE_VALUES,
      ),
      importUsageCounts: addCounts(
        prev?.importUsageCounts,
        normalizedCounts(e.importUsageCounts, IMPORT_USAGE_VALUES, e.count ?? 0),
        IMPORT_USAGE_VALUES,
      ),
      productValueCount:
        (prev?.productValueCount ?? 0) +
        (Number.isInteger(e.productValueCount)
          ? e.productValueCount
          : (e.evidence ?? []).filter(
              (row) =>
                row.sourceRole === 'production' && row.importUsage === 'value',
            ).length),
      evidence,
      evidenceLimited:
        Boolean(prev?.evidenceLimited) ||
        Boolean(e.evidenceLimited) ||
        (e.count ?? 0) + (prev?.count ?? 0) > evidence.length,
    });
  }

  const inBoth = [];
  const inCodeMissingFromVault = [];
  const inCodeMissingEndpointAbsent = [];
  const inVaultNotInCode = [];
  const notJudgeableByImports = [];

  for (const [k, edge] of codeMap) {
    if (vaultMap.has(k)) {
      inBoth.push({ from: edge.from, to: edge.to });
      continue;
    }
    const absentEndpoints = nodeSet
      ? [edge.from, edge.to].filter((s) => !nodeSet.has(s))
      : [];
    if (absentEndpoints.length > 0) {
      // Endpoint isn't a vault node (folder-derived slug) — not directly landable.
      inCodeMissingEndpointAbsent.push({
        from: edge.from,
        to: edge.to,
        count: edge.count,
        absentEndpoints,
        sourceEvidence: edge.evidence,
        sourceEvidenceLimited: edge.evidenceLimited,
        evidenceQualification: evidenceQualification(edge),
        review: reviewRequirement(edge, { endpointAbsent: true }),
      });
    } else {
      inCodeMissingFromVault.push({
        from: edge.from,
        to: edge.to,
        count: edge.count,
        sourceEvidence: edge.evidence,
        sourceEvidenceLimited: edge.evidenceLimited,
        evidenceQualification: evidenceQualification(edge),
        review: reviewRequirement(edge),
      });
    }
  }
  for (const [k, edge] of vaultMap) {
    if (codeMap.has(k)) continue;
    // **Defer the verdict** when either side has an unreadable implementation.
    // Routing it to "may be stale" here makes an agent delete a correct relation
    // (measured 2026-08-17).
    const from = readabilityOf(edge.from, pathBySlug, extensions);
    const to = readabilityOf(edge.to, pathBySlug, extensions);
    if (!from.readable || !to.readable) {
      notJudgeableByImports.push({
        from: edge.from,
        to: edge.to,
        ref: edge.ref,
        via: edge.via,
        unreadable: [
          ...(from.readable ? [] : [edge.from]),
          ...(to.readable ? [] : [edge.to]),
        ],
        reason: (from.readable ? to : from).reason,
      });
      continue;
    }
    inVaultNotInCode.push({ from: edge.from, to: edge.to, ref: edge.ref, via: edge.via });
  }

  const byFromTo = (a, b) => key(a.from, a.to).localeCompare(key(b.from, b.to));
  inBoth.sort(byFromTo);
  inCodeMissingFromVault.sort(byFromTo);
  inCodeMissingEndpointAbsent.sort(byFromTo);
  inVaultNotInCode.sort(byFromTo);
  notJudgeableByImports.sort(byFromTo);

  return {
    inBoth,
    inCodeMissingFromVault,
    inCodeMissingEndpointAbsent,
    inVaultNotInCode,
    notJudgeableByImports,
  };
}

/**
 * Project exactly one import-backed relation candidate into an executable
 * review packet. The order is canonical from/to order from reconcileImportEdges;
 * it is a review cursor, never a meaning-confidence ranking.
 */
export function buildNextImportRelationReview(
  reconciliation,
  { afterReviewId = null, rootPath = null } = {},
) {
  const directlyReviewable = Array.isArray(reconciliation?.inCodeMissingFromVault)
    ? reconciliation.inCodeMissingFromVault
    : [];
  const endpointModelling = Array.isArray(reconciliation?.inCodeMissingEndpointAbsent)
    ? reconciliation.inCodeMissingEndpointAbsent
    : [];
  // Existing concepts remain the first review class, followed by endpoint
  // modelling. Both classes stay in one cursor so a mixed queue cannot hide
  // missing-endpoint recovery forever.
  const candidates = [...directlyReviewable, ...endpointModelling];
  const rows = candidates.map((candidate) => ({
    candidate,
    reviewId: importRelationReviewId(candidate),
  }));
  let index = 0;
  if (afterReviewId !== null) {
    const previous = rows.findIndex((row) => row.reviewId === afterReviewId);
    if (previous === -1) {
      throw new Error(
        `afterReviewId was not found in the current import review queue: ${afterReviewId}. ` +
        'Omit afterReviewId to restart from the first current candidate.',
      );
    }
    index = previous + 1;
  }
  if (index >= rows.length) return null;

  const { candidate, reviewId } = rows[index];
  const from = candidate.from;
  const to = candidate.to;
  const required = Array.isArray(candidate.review?.required) && candidate.review.required.length > 0
    ? candidate.review.required
    : ['semantic_rationale', 'human_approval'];
  const requiresVaultEndpoints = required.includes('vault_endpoints');
  const absentEndpoints = Array.isArray(candidate.absentEndpoints)
    ? [...candidate.absentEndpoints]
    : [];
  if (requiresVaultEndpoints && (typeof rootPath !== 'string' || rootPath.trim().length === 0)) {
    throw new Error('rootPath is required to build exact endpoint-modelling recovery arguments.');
  }
  const endpointModellingRecovery = requiresVaultEndpoints
    ? buildEndpointModellingRecovery({ candidate, absentEndpoints, rootPath })
    : null;
  const remaining = rows.length - index - 1;
  return {
    contract: 'nextRelationReview:v1',
    reviewId,
    status: 'rationale_review_required',
    writeAllowed: false,
    sourceQualification: 'observed_this_call_not_relation_receipt',
    ordering: {
      basis: 'canonical_from_to',
      meaningConfidence: false,
      note: 'Queue order is deterministic review order, not evidence that this candidate is semantically stronger.',
    },
    candidate: {
      from,
      to,
      relationType: 'depends_on',
      absentEndpoints,
      importCount: candidate.count ?? 0,
      sourceEvidence: candidate.sourceEvidence ?? [],
      sourceEvidenceLimited: Boolean(candidate.sourceEvidenceLimited),
      evidenceQualification: candidate.evidenceQualification ?? evidenceQualification(candidate),
    },
    endpointModelling: endpointModellingRecovery,
    nextCalls: requiresVaultEndpoints
      ? []
      : [
          {
            tool: 'get_concepts',
            arguments: { slugs: [from, to], body: 'full' },
            purpose: 'Read both ontology meanings before deciding whether the code fact is a semantic dependency.',
          },
          {
            tool: 'query_ontology',
            arguments: { operation: 'relation_check', from, to, type: 'depends_on' },
            purpose: 'Check graph shape only; safe_to_add is not semantic approval.',
          },
        ],
    decision: {
      questionEligibility:
        requiresVaultEndpoints
          ? 'blocked_missing_vault_endpoints'
          : (candidate.evidenceQualification?.productValueCount ?? 0) > 0
          ? 'eligible_after_semantic_review'
          : 'additional_product_meaning_evidence_required',
      required,
      ask: requiresVaultEndpoints
        ? 'Do not ask for relation approval yet. First model and review both ontology endpoints, then explain the observable ability and semantic rationale before asking for approval.'
        : (candidate.evidenceQualification?.productValueCount ?? 0) > 0
        ? 'After the reads, explain which observable ability of the source concept fails without the target. ' +
          'Only if that stable meaning dependency holds, ask the person to approve this exact direction and rationale.'
        : 'Do not ask the person to approve a product depends_on relation from this import alone: no product-code value import was observed. ' +
          'Keep the test/type evidence visible and require separate product meaning evidence before any approval question.',
      stopWhen: [
        'either endpoint meaning does not match the source files',
        'relation_check reports an existing or inverse relation that needs review',
        'the import is an implementation convenience rather than a stable meaning dependency',
        'a nonblank semantic rationale cannot be stated',
      ],
    },
    cursor: {
      afterReviewId,
      total: rows.length,
      remaining,
      hasMore: remaining > 0,
      nextAfterReviewId: reviewId,
    },
  };
}

function buildEndpointModellingRecovery({ candidate, absentEndpoints, rootPath }) {
  const observedPathsByEndpoint = absentEndpoints.map((endpoint) => {
    const paths = [];
    for (const evidence of candidate.sourceEvidence ?? []) {
      if (endpoint === candidate.from && typeof evidence.from === 'string') paths.push(evidence.from);
      if (endpoint === candidate.to && typeof evidence.to === 'string') paths.push(evidence.to);
    }
    return { endpoint, paths: [...new Set(paths)].sort() };
  });
  return {
    status: 'required_before_relation_review',
    writeAllowed: false,
    absentEndpoints,
    observedPathsByEndpoint,
    analysisCall: {
      tool: 'analyze_repo_structure',
      arguments: { rootPath },
      purpose: 'Refresh repository candidates and evidence only; this call does not create or validate either missing ontology endpoint.',
    },
    proposalValidation: {
      tool: 'analyze_repo_structure',
      requiredArguments: ['rootPath', 'proposal'],
      requiredProposalFields: ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'],
      fieldsAfterKindDecision: endpointProposalFieldRequirements(),
      endpointDrafts: observedPathsByEndpoint.map(({ endpoint, paths }) => ({
        endpoint,
        observedPaths: paths,
        slugCandidate: endpoint,
        kindDecision: 'human_meaning_required',
      })),
      purpose: 'Build a complete proposal from reviewed product meaning, then pass it with rootPath. Do not infer kind, title, definition, domain, or path from the endpoint slug alone.',
    },
    resumeCall: {
      tool: 'infer_imports',
      arguments: { rootPath, reviewMode: 'next' },
      purpose: 'After an accepted endpoint plan is written, restart the current semantic queue so this candidate is reclassified against the new vault nodes.',
    },
  };
}

function endpointProposalFieldRequirements() {
  const common = ['slug', 'title', 'definition', 'evidence', 'confidence'];
  return {
    common,
    byKind: {
      project: [],
      domain: [],
      capability: ['domain'],
      element: ['domain', 'path'],
    },
  };
}

function importRelationReviewId({ from, to }) {
  return `import-review:${encodeURIComponent(from ?? '')}:${encodeURIComponent(to ?? '')}`;
}

function reviewRequirement(edge, { endpointAbsent = false } = {}) {
  const required = [];
  if (endpointAbsent) required.push('vault_endpoints');
  if ((edge.evidence?.length ?? 0) === 0) required.push('source_evidence');
  required.push('semantic_rationale', 'human_approval');
  if ((edge.productValueCount ?? 0) === 0) required.unshift('product_meaning_evidence');
  return {
    status: 'rationale_review_required',
    writeAllowed: false,
    required,
    next: (edge.productValueCount ?? 0) > 0
      ? 'Review the exact import evidence and both ontology concepts, explain why the semantic dependency holds, ask the user, then write one explicit depends_on relation with why.'
      : 'No product-code value import was observed. Preserve the test/type evidence, but do not frame it as a product depends_on approval question without separate product meaning evidence.',
  };
}

function normalizedCounts(counts, values, fallbackCount) {
  if (counts && typeof counts === 'object') {
    return Object.fromEntries(values.map((value) => [value, counts[value] ?? 0]));
  }
  return Object.fromEntries(
    values.map((value) => [value, value === 'unknown' ? fallbackCount : 0]),
  );
}

function addCounts(left, right, values) {
  return Object.fromEntries(
    values.map((value) => [value, (left?.[value] ?? 0) + (right?.[value] ?? 0)]),
  );
}

function evidenceQualification(edge) {
  const productValueCount = edge.productValueCount ?? 0;
  return {
    basis: 'whole_module_edge',
    sourceRoleCounts: normalizedCounts(
      edge.sourceRoleCounts,
      SOURCE_ROLE_VALUES,
      edge.count ?? 0,
    ),
    importUsageCounts: normalizedCounts(
      edge.importUsageCounts,
      IMPORT_USAGE_VALUES,
      edge.count ?? 0,
    ),
    productValueCount,
    status: productValueCount > 0
      ? 'product_value_observed'
      : 'product_value_not_observed',
  };
}
