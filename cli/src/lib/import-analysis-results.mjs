const EDGE_KINDS = new Set(['static', 'dynamic', 'require', 'reexport', 'side']);
const UNRESOLVED_REASONS = new Set(['empty', 'relative-not-found', 'alias-not-found']);

export function assertInferImportsResult(payload, context = 'infer_imports') {
  assertObject(payload, context);
  assertNonEmptyString(payload.rootPath, `${context}.rootPath`);
  assertNonNegativeInteger(payload.filesScanned, `${context}.filesScanned`);
  if (payload.delivery?.selection === 'automatic_compact') {
    assertCompactInferImportsResult(payload, context);
    return;
  }
  assertArray(payload.edges, `${context}.edges`);
  assertArray(payload.externalImports, `${context}.externalImports`);
  assertArray(payload.unresolved, `${context}.unresolved`);
  assertArray(payload.moduleEdges, `${context}.moduleEdges`);

  payload.edges.forEach((row, index) => assertFileEdge(row, `${context}.edges[${index}]`));
  payload.externalImports.forEach((row, index) => {
    const rowPath = `${context}.externalImports[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.spec, `${rowPath}.spec`);
  });
  payload.unresolved.forEach((row, index) => {
    const rowPath = `${context}.unresolved[${index}]`;
    assertObject(row, rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.spec, `${rowPath}.spec`);
    assertUnresolvedReason(row.reason, `${rowPath}.reason`);
  });
  payload.moduleEdges.forEach((row, index) => assertModuleEdge(row, `${context}.moduleEdges[${index}]`));
}

function assertCompactInferImportsResult(payload, context) {
  const deliveryPath = `${context}.delivery`;
  assertObject(payload.delivery, deliveryPath);
  assertExactKeys(payload.delivery, ['selection', 'reason', 'estimatedFullResponseBytes', 'automaticLimitBytes', 'explicitFullAvailable', 'explicitFullArguments'], deliveryPath);
  if (payload.delivery.selection !== 'automatic_compact') {
    throw new Error(`${deliveryPath}.selection must be automatic_compact`);
  }
  if (payload.delivery.reason !== 'estimated_full_response_exceeds_limit') {
    throw new Error(`${deliveryPath}.reason must be estimated_full_response_exceeds_limit`);
  }
  assertNonNegativeInteger(payload.delivery.estimatedFullResponseBytes, `${deliveryPath}.estimatedFullResponseBytes`);
  if (payload.delivery.estimatedFullResponseBytes <= 131072) {
    throw new Error(`${deliveryPath}.estimatedFullResponseBytes must exceed the automatic compact limit`);
  }
  if (payload.delivery.automaticLimitBytes !== 131072) {
    throw new Error(`${deliveryPath}.automaticLimitBytes must be 131072`);
  }
  if (payload.delivery.explicitFullAvailable !== true) {
    throw new Error(`${deliveryPath}.explicitFullAvailable must be true`);
  }
  assertObject(payload.delivery.explicitFullArguments, `${deliveryPath}.explicitFullArguments`);
  assertExactKeys(payload.delivery.explicitFullArguments, ['reviewMode', 'allowLargeResponse'], `${deliveryPath}.explicitFullArguments`);
  if (payload.delivery.explicitFullArguments.reviewMode !== 'full' || payload.delivery.explicitFullArguments.allowLargeResponse !== true) {
    throw new Error(`${deliveryPath}.explicitFullArguments must request reviewMode full with allowLargeResponse true`);
  }

  assertObject(payload.scanSummary, `${context}.scanSummary`);
  assertExactKeys(payload.scanSummary, ['fileEdges', 'externalImports', 'unresolvedImports', 'moduleEdges'], `${context}.scanSummary`);
  for (const field of ['fileEdges', 'externalImports', 'unresolvedImports', 'moduleEdges']) {
    assertNonNegativeInteger(payload.scanSummary[field], `${context}.scanSummary.${field}`);
  }
  assertObject(payload.reviewQueue, `${context}.reviewQueue`);
  assertExactKeys(payload.reviewQueue, ['total', 'returned', 'exhausted', 'afterReviewId'], `${context}.reviewQueue`);
  assertNonNegativeInteger(payload.reviewQueue.total, `${context}.reviewQueue.total`);
  if (![0, 1].includes(payload.reviewQueue.returned)) {
    throw new Error(`${context}.reviewQueue.returned must be 0 or 1`);
  }
  if (typeof payload.reviewQueue.exhausted !== 'boolean') {
    throw new Error(`${context}.reviewQueue.exhausted must be a boolean`);
  }
  if (payload.reviewQueue.afterReviewId !== null && typeof payload.reviewQueue.afterReviewId !== 'string') {
    throw new Error(`${context}.reviewQueue.afterReviewId must be a string or null`);
  }
  if (payload.reviewQueue.returned > payload.reviewQueue.total) {
    throw new Error(`${context}.reviewQueue.returned must not exceed total`);
  }
  if (payload.reviewQueue.total > 0) {
    assertCompactNextReview(payload.nextReview, `${context}.nextReview`);
  } else if (payload.nextReview !== null) {
    throw new Error(`${context}.nextReview must be null when reviewQueue.total is 0`);
  }
}

function assertCompactNextReview(nextReview, path) {
  assertObject(nextReview, path);
  assertExactKeys(nextReview, ['contract', 'reviewId', 'status', 'writeAllowed', 'sourceQualification', 'ordering', 'candidate', 'endpointModelling', 'nextCalls', 'decision', 'cursor'], path);
  assertNonEmptyString(nextReview.contract, `${path}.contract`);
  if (nextReview.contract !== 'nextRelationReview:v1') throw new Error(`${path}.contract must be nextRelationReview:v1`);
  assertNonEmptyString(nextReview.reviewId, `${path}.reviewId`);
  if (nextReview.status !== 'rationale_review_required') throw new Error(`${path}.status must be rationale_review_required`);
  if (nextReview.writeAllowed !== false) throw new Error(`${path}.writeAllowed must be false`);
  if (nextReview.sourceQualification !== 'observed_this_call_not_relation_receipt') {
    throw new Error(`${path}.sourceQualification must be observed_this_call_not_relation_receipt`);
  }
  assertObject(nextReview.ordering, `${path}.ordering`);
  assertExactKeys(nextReview.ordering, ['basis', 'meaningConfidence', 'note'], `${path}.ordering`);
  if (nextReview.ordering.basis !== 'canonical_from_to' || nextReview.ordering.meaningConfidence !== false) {
    throw new Error(`${path}.ordering must use canonical_from_to with meaningConfidence false`);
  }
  assertNonEmptyString(nextReview.ordering.note, `${path}.ordering.note`);

  const candidatePath = `${path}.candidate`;
  assertObject(nextReview.candidate, candidatePath);
  assertExactKeys(nextReview.candidate, ['from', 'to', 'relationType', 'absentEndpoints', 'importCount', 'sourceEvidence', 'sourceEvidenceLimited', 'evidenceQualification'], candidatePath);
  assertNonEmptyString(nextReview.candidate.from, `${candidatePath}.from`);
  assertNonEmptyString(nextReview.candidate.to, `${candidatePath}.to`);
  if (nextReview.candidate.relationType !== 'depends_on') throw new Error(`${candidatePath}.relationType must be depends_on`);
  assertArray(nextReview.candidate.absentEndpoints, `${candidatePath}.absentEndpoints`);
  if (nextReview.candidate.absentEndpoints.length > 2 || new Set(nextReview.candidate.absentEndpoints).size !== nextReview.candidate.absentEndpoints.length) {
    throw new Error(`${candidatePath}.absentEndpoints must contain at most 2 unique endpoints`);
  }
  nextReview.candidate.absentEndpoints.forEach((value, index) => assertNonEmptyString(value, `${candidatePath}.absentEndpoints[${index}]`));
  assertNonNegativeInteger(nextReview.candidate.importCount, `${candidatePath}.importCount`);
  assertArray(nextReview.candidate.sourceEvidence, `${candidatePath}.sourceEvidence`);
  if (nextReview.candidate.sourceEvidence.length > 5) throw new Error(`${candidatePath}.sourceEvidence must contain at most 5 rows`);
  nextReview.candidate.sourceEvidence.forEach((row, index) => {
    const rowPath = `${candidatePath}.sourceEvidence[${index}]`;
    assertObject(row, rowPath);
    assertExactKeys(row, ['from', 'to', 'kind', 'sourceRole', 'importUsage'], rowPath);
    assertNonEmptyString(row.from, `${rowPath}.from`);
    assertNonEmptyString(row.to, `${rowPath}.to`);
    assertEdgeKind(row.kind, `${rowPath}.kind`);
    if (!['production', 'test', 'unknown'].includes(row.sourceRole)) throw new Error(`${rowPath}.sourceRole is invalid`);
    if (!['value', 'type_only', 'unknown'].includes(row.importUsage)) throw new Error(`${rowPath}.importUsage is invalid`);
  });
  if (typeof nextReview.candidate.sourceEvidenceLimited !== 'boolean') throw new Error(`${candidatePath}.sourceEvidenceLimited must be a boolean`);
  assertObject(nextReview.candidate.evidenceQualification, `${candidatePath}.evidenceQualification`);
  assertExactKeys(nextReview.candidate.evidenceQualification, ['basis', 'sourceRoleCounts', 'importUsageCounts', 'productValueCount', 'status'], `${candidatePath}.evidenceQualification`);
  if (nextReview.candidate.evidenceQualification.basis !== 'whole_module_edge') throw new Error(`${candidatePath}.evidenceQualification.basis is invalid`);
  assertCountMap(nextReview.candidate.evidenceQualification.sourceRoleCounts, ['production', 'test', 'unknown'], `${candidatePath}.evidenceQualification.sourceRoleCounts`);
  assertCountMap(nextReview.candidate.evidenceQualification.importUsageCounts, ['value', 'type_only', 'unknown'], `${candidatePath}.evidenceQualification.importUsageCounts`);
  assertNonNegativeInteger(nextReview.candidate.evidenceQualification.productValueCount, `${candidatePath}.evidenceQualification.productValueCount`);
  if (!['product_value_observed', 'product_value_not_observed'].includes(nextReview.candidate.evidenceQualification.status)) throw new Error(`${candidatePath}.evidenceQualification.status is invalid`);

  const endpointPath = `${path}.endpointModelling`;
  if (nextReview.endpointModelling !== null) {
    assertObject(nextReview.endpointModelling, endpointPath);
    assertExactKeys(nextReview.endpointModelling, ['status', 'writeAllowed', 'absentEndpoints', 'observedPathsByEndpoint', 'analysisCall', 'proposalValidation', 'resumeCall'], endpointPath);
    if (nextReview.endpointModelling.status !== 'required_before_relation_review' || nextReview.endpointModelling.writeAllowed !== false) throw new Error(`${endpointPath} must remain write-blocked endpoint modelling`);
  assertArray(nextReview.endpointModelling.absentEndpoints, `${endpointPath}.absentEndpoints`);
  if (nextReview.endpointModelling.absentEndpoints.length < 1 || nextReview.endpointModelling.absentEndpoints.length > 2) throw new Error(`${endpointPath}.absentEndpoints must contain 1 or 2 endpoints`);
  assertArray(nextReview.endpointModelling.observedPathsByEndpoint, `${endpointPath}.observedPathsByEndpoint`);
  nextReview.endpointModelling.observedPathsByEndpoint.forEach((row, index) => {
    const rowPath = `${endpointPath}.observedPathsByEndpoint[${index}]`;
    assertObject(row, rowPath);
    assertExactKeys(row, ['endpoint', 'paths'], rowPath);
    assertNonEmptyString(row.endpoint, `${rowPath}.endpoint`);
    assertArray(row.paths, `${rowPath}.paths`);
    row.paths.forEach((value, pathIndex) => assertNonEmptyString(value, `${rowPath}.paths[${pathIndex}]`));
  });
  assertMeaningCall(nextReview.endpointModelling.analysisCall, `${endpointPath}.analysisCall`, 'analyze_repo_structure');
  assertProposalValidation(nextReview.endpointModelling.proposalValidation, `${endpointPath}.proposalValidation`);
  assertMeaningCall(nextReview.endpointModelling.resumeCall, `${endpointPath}.resumeCall`, 'infer_imports');
  if (nextReview.endpointModelling.resumeCall.arguments.reviewMode !== 'next') throw new Error(`${endpointPath}.resumeCall.arguments.reviewMode must be next`);
  }
  assertArray(nextReview.nextCalls, `${path}.nextCalls`);
  nextReview.nextCalls.forEach((row, index) => {
    const rowPath = `${path}.nextCalls[${index}]`;
    assertObject(row, rowPath);
    assertExactKeys(row, ['tool', 'arguments', 'purpose'], rowPath);
    if (!['get_concepts', 'query_ontology'].includes(row.tool)) throw new Error(`${rowPath}.tool is invalid`);
    assertObject(row.arguments, `${rowPath}.arguments`);
    assertNonEmptyString(row.purpose, `${rowPath}.purpose`);
  });
  assertObject(nextReview.decision, `${path}.decision`);
  assertExactKeys(nextReview.decision, ['questionEligibility', 'required', 'ask', 'stopWhen'], `${path}.decision`);
  if (!['blocked_missing_vault_endpoints', 'eligible_after_semantic_review', 'additional_product_meaning_evidence_required'].includes(nextReview.decision.questionEligibility)) throw new Error(`${path}.decision.questionEligibility is invalid`);
  assertArray(nextReview.decision.required, `${path}.decision.required`);
  if (nextReview.decision.required.length < 1) throw new Error(`${path}.decision.required must not be empty`);
  nextReview.decision.required.forEach((value, index) => assertNonEmptyString(value, `${path}.decision.required[${index}]`));
  assertNonEmptyString(nextReview.decision.ask, `${path}.decision.ask`);
  assertArray(nextReview.decision.stopWhen, `${path}.decision.stopWhen`);
  if (nextReview.decision.stopWhen.length < 1) throw new Error(`${path}.decision.stopWhen must not be empty`);
  nextReview.decision.stopWhen.forEach((value, index) => assertNonEmptyString(value, `${path}.decision.stopWhen[${index}]`));
  assertObject(nextReview.cursor, `${path}.cursor`);
  assertExactKeys(nextReview.cursor, ['afterReviewId', 'total', 'remaining', 'hasMore', 'nextAfterReviewId'], `${path}.cursor`);
  if (nextReview.cursor.afterReviewId !== null && typeof nextReview.cursor.afterReviewId !== 'string') throw new Error(`${path}.cursor.afterReviewId must be a string or null`);
  assertPositiveInteger(nextReview.cursor.total, `${path}.cursor.total`);
  assertNonNegativeInteger(nextReview.cursor.remaining, `${path}.cursor.remaining`);
  if (typeof nextReview.cursor.hasMore !== 'boolean') throw new Error(`${path}.cursor.hasMore must be a boolean`);
  assertNonEmptyString(nextReview.cursor.nextAfterReviewId, `${path}.cursor.nextAfterReviewId`);
}

function assertCountMap(value, keys, path) {
  assertObject(value, path);
  assertExactKeys(value, keys, path);
  for (const key of keys) assertNonNegativeInteger(value[key], `${path}.${key}`);
}

function assertMeaningCall(value, path, tool) {
  assertObject(value, path);
  assertExactKeys(value, ['tool', 'arguments', 'purpose'], path);
  if (value.tool !== tool) throw new Error(`${path}.tool must be ${tool}`);
  assertObject(value.arguments, `${path}.arguments`);
  assertExactKeys(value.arguments, tool === 'infer_imports' ? ['rootPath', 'reviewMode'] : ['rootPath'], `${path}.arguments`);
  assertNonEmptyString(value.arguments.rootPath, `${path}.arguments.rootPath`);
  assertNonEmptyString(value.purpose, `${path}.purpose`);
}

function assertProposalValidation(value, path) {
  assertObject(value, path);
  assertExactKeys(value, ['tool', 'requiredArguments', 'requiredProposalFields', 'fieldsAfterKindDecision', 'endpointDrafts', 'purpose'], path);
  if (value.tool !== 'analyze_repo_structure') throw new Error(`${path}.tool must be analyze_repo_structure`);
  assertArray(value.requiredArguments, `${path}.requiredArguments`);
  if (value.requiredArguments.length !== 2 || new Set(value.requiredArguments).size !== 2 || !value.requiredArguments.includes('rootPath') || !value.requiredArguments.includes('proposal')) {
    throw new Error(`${path}.requiredArguments must contain rootPath and proposal`);
  }
  assertArray(value.requiredProposalFields, `${path}.requiredProposalFields`);
  const proposalFields = ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'];
  if (value.requiredProposalFields.length !== proposalFields.length || proposalFields.some((field) => !value.requiredProposalFields.includes(field))) {
    throw new Error(`${path}.requiredProposalFields must enumerate the six proposal fields`);
  }
  assertObject(value.fieldsAfterKindDecision, `${path}.fieldsAfterKindDecision`);
  assertExactKeys(value.fieldsAfterKindDecision, ['common', 'byKind'], `${path}.fieldsAfterKindDecision`);
  assertArray(value.fieldsAfterKindDecision.common, `${path}.fieldsAfterKindDecision.common`);
  const common = ['slug', 'title', 'definition', 'evidence', 'confidence'];
  if (value.fieldsAfterKindDecision.common.length !== common.length || common.some((field) => !value.fieldsAfterKindDecision.common.includes(field))) {
    throw new Error(`${path}.fieldsAfterKindDecision.common is incomplete`);
  }
  assertObject(value.fieldsAfterKindDecision.byKind, `${path}.fieldsAfterKindDecision.byKind`);
  assertExactKeys(value.fieldsAfterKindDecision.byKind, ['project', 'domain', 'capability', 'element'], `${path}.fieldsAfterKindDecision.byKind`);
  for (const kind of ['project', 'domain', 'capability', 'element']) {
    assertArray(value.fieldsAfterKindDecision.byKind[kind], `${path}.fieldsAfterKindDecision.byKind.${kind}`);
  }
  if (value.fieldsAfterKindDecision.byKind.project.length !== 0 || value.fieldsAfterKindDecision.byKind.domain.length !== 0 || value.fieldsAfterKindDecision.byKind.capability.length !== 1 || value.fieldsAfterKindDecision.byKind.capability[0] !== 'domain' || value.fieldsAfterKindDecision.byKind.element.length !== 2 || !['domain', 'path'].every((field) => value.fieldsAfterKindDecision.byKind.element.includes(field))) {
    throw new Error(`${path}.fieldsAfterKindDecision.byKind is invalid`);
  }
  assertArray(value.endpointDrafts, `${path}.endpointDrafts`);
  if (value.endpointDrafts.length < 1 || value.endpointDrafts.length > 2) throw new Error(`${path}.endpointDrafts must contain 1 or 2 drafts`);
  value.endpointDrafts.forEach((draft, index) => {
    const draftPath = `${path}.endpointDrafts[${index}]`;
    assertObject(draft, draftPath);
    assertExactKeys(draft, ['endpoint', 'observedPaths', 'slugCandidate', 'kindDecision'], draftPath);
    assertNonEmptyString(draft.endpoint, `${draftPath}.endpoint`);
    assertArray(draft.observedPaths, `${draftPath}.observedPaths`);
    draft.observedPaths.forEach((observedPath, observedIndex) => assertNonEmptyString(observedPath, `${draftPath}.observedPaths[${observedIndex}]`));
    assertNonEmptyString(draft.slugCandidate, `${draftPath}.slugCandidate`);
    if (draft.kindDecision !== 'human_meaning_required') throw new Error(`${draftPath}.kindDecision is invalid`);
  });
  assertNonEmptyString(value.purpose, `${path}.purpose`);
}

function assertFileEdge(row, path) {
  assertObject(row, path);
  assertNonEmptyString(row.from, `${path}.from`);
  assertNonEmptyString(row.to, `${path}.to`);
  assertEdgeKind(row.kind, `${path}.kind`);
}

function assertModuleEdge(row, path) {
  assertObject(row, path);
  assertNonEmptyString(row.from, `${path}.from`);
  assertNonEmptyString(row.to, `${path}.to`);
  assertPositiveInteger(row.count, `${path}.count`);
  assertObject(row.kindCounts, `${path}.kindCounts`);
  let total = 0;
  for (const [kind, count] of Object.entries(row.kindCounts)) {
    assertEdgeKind(kind, `${path}.kindCounts.${kind}`);
    assertPositiveInteger(count, `${path}.kindCounts.${kind}`);
    total += count;
  }
  if (total !== row.count) {
    throw new Error(`${path}.kindCounts total must equal count: count ${row.count}, kindCounts ${total}`);
  }
  if (row.evidence !== undefined || row.evidenceLimited !== undefined) {
    assertArray(row.evidence, `${path}.evidence`);
    if (row.evidence.length > 5) {
      throw new Error(`${path}.evidence must contain at most 5 rows`);
    }
    row.evidence.forEach((evidence, index) =>
      assertFileEdge(evidence, `${path}.evidence[${index}]`),
    );
    if (typeof row.evidenceLimited !== 'boolean') {
      throw new Error(`${path}.evidenceLimited must be a boolean`);
    }
  }
}

function assertObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function assertExactKeys(value, allowed, path) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${path} has unexpected field(s): ${unexpected.join(', ')}`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
}

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative integer`);
  }
}

function assertPositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${path} must be a positive integer`);
  }
}

function assertEdgeKind(value, path) {
  if (typeof value !== 'string' || !EDGE_KINDS.has(value)) {
    throw new Error(`${path} must be one of ${[...EDGE_KINDS].join(', ')}`);
  }
}

function assertUnresolvedReason(value, path) {
  if (typeof value !== 'string' || !UNRESOLVED_REASONS.has(value)) {
    throw new Error(`${path} must be one of ${[...UNRESOLVED_REASONS].join(', ')}`);
  }
}
