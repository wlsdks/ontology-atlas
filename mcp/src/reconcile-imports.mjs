// The set difference between code-derived import edges (`inferImports()`) and
// the vault's compiled depends_on edges, so the agent gets "exactly what to
// sync" instead of every import. Read-only: changes still land through a
// confirmed add_relation.

// The compiler stores `depends_on` as `dependencies`; matching 'depends_on' alone
// would swallow every real dependency edge.
const DEPENDS_ON_VIA = new Set(['dependencies', 'depends_on']);
/** infer-imports' `supportedExtensions`; the caller's actual value wins so the two cannot drift. */
const DEFAULT_SCANNED_EXTENSIONS = new Set([
  '.cjs', '.cts', '.go', '.js', '.jsx', '.mjs', '.mts', '.py', '.rs', '.ts', '.tsx',
]);

/**
 * Can the scanner read this endpoint's implementation? Reporting "did not see"
 * as "does not exist" makes an agent delete a correct relation (a native C
 * endpoint has no scannable imports), so the verdict must be able to defer.
 */
function readabilityOf(slug, pathMap, extensions) {
  if (!pathMap) return { readable: true, reason: null };
  const raw = pathMap instanceof Map ? pathMap.get(slug) : pathMap[slug];
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { readable: false, reason: 'endpoint_path_unknown' };
  }
  const dot = raw.lastIndexOf('.');
  const slash = raw.lastIndexOf('/');
  // No extension points at a directory, which may hold readable files.
  if (dot <= slash) return { readable: true, reason: null };
  const ext = raw.slice(dot).toLowerCase();
  return extensions.has(ext)
    ? { readable: true, reason: null }
    : { readable: false, reason: 'endpoint_language_not_scanned' };
}

const SOURCE_ROLE_VALUES = ['production', 'test', 'unknown'];
const IMPORT_USAGE_VALUES = ['value', 'type_only', 'unknown'];

/**
 * Diffs code-derived import edges against compiled vault depends_on edges: Map
 * joins keyed by JSON `[from, to]`, O(E_code + E_vault), then each output list is
 * sorted, O(E log E).
 *
 * @param {object} args
 * @param {Array<{from:string,to:string,count?:number}>} [args.moduleEdges]  inferImports().moduleEdges
 * @param {Array<{from:string,to:string,via?:string,ref?:string}>} [args.compiledEdges]  compileOntology().edges
 * @param {Map<string,string>|Record<string,string>} [args.aliasToSlug]  alias → canonical slug (compiler index)
 * @param {Set<string>|Array<string>} [args.nodeSlugs]  existing node slugs. A code-only edge between real
 *   nodes goes to `inCodeMissingFromVault`; one with a non-node endpoint to `inCodeMissingEndpointAbsent`.
 *   Neither is directly landable: an import is source evidence, not a meaning dependency.
 * @param {Record<string,string>|Map<string,string>} [args.pathBySlug]  slug → `path:`. Given, edges whose
 *   implementation the scanner cannot read go to `notJudgeableByImports`.
 * @param {Set<string>|Array<string>} [args.scannedExtensions]  `inferImports().coverage.supportedExtensions`
 * @returns {{inBoth:Array,inCodeMissingFromVault:Array,inCodeMissingEndpointAbsent:Array,inVaultNotInCode:Array,notJudgeableByImports:Array}}
 */
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
  // The compiled `to` is alias-resolved and module endpoints may not be, so both
  // sides go through the compiler's alias map.
  const norm = (s) => {
    if (s == null) return s;
    const hit = aliasToSlug instanceof Map ? aliasToSlug.get(s) : aliasToSlug?.[s];
    return hit ?? s;
  };
  // JSON, not a NUL separator, keeps this file text to git.
  const key = (from, to) => JSON.stringify([from, to]);

  const vaultMap = new Map();
  for (const e of compiledEdges) {
    if (!DEPENDS_ON_VIA.has(e?.via)) continue;
    const from = norm(e.from);
    const to = norm(e.to);
    if (!from || !to || from === to) continue;
    vaultMap.set(key(from, to), { from, to, ref: e.ref, via: e.via });
  }

  // Alias-collapsed: counts are summed, with a bounded source receipt for review.
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
    // Defer when either side is unreadable, or an agent deletes a correct relation.
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
 * One import-backed candidate as an executable review packet, in the canonical
 * from/to order: a review cursor, never a confidence ranking.
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
  // Existing concepts first, then endpoint modelling, in one cursor so a mixed
  // queue cannot starve missing-endpoint recovery.
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
