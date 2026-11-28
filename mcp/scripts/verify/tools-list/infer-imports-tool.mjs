import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_SOURCE_ROLE_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
  IMPORT_USAGE_VALUES,
} from '../../../src/infer-imports.mjs';

import { sameArray } from '../value-checks.mjs';
import { nonBlankStringSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

export function inferImportsToolSchemaFailure(tools) {
  const inferImportsTool = tools.find((tool) => tool?.name === 'infer_imports');
  if (!inferImportsTool) return 'tools/list response missing infer_imports tool';
  if (
    !/walk TS\/JS files in a code repo and infer file-level \+ module-level import edges/i.test(inferImportsTool.description || '') ||
    !/side effect 0 \(vault frontmatter NOT modified\)/i.test(inferImportsTool.description || '') ||
    !/source-backed review candidates/i.test(inferImportsTool.description || '') ||
    !/focusPath/i.test(inferImportsTool.description || '') ||
    !/incoming\/outgoing/i.test(inferImportsTool.description || '') ||
    !/Omit `reviewMode`/i.test(inferImportsTool.description || '') ||
    !/128 KiB/i.test(inferImportsTool.description || '') ||
    !/delivery receipt/i.test(inferImportsTool.description || '') ||
    !/exactly one compact, non-writing `nextRelationReview:v1` packet/i.test(inferImportsTool.description || '') ||
    !/kindCounts/i.test(inferImportsTool.description || '') ||
    !/bounded exact file-edge `evidence` receipt/i.test(inferImportsTool.description || '') ||
    !/rationale_review_required/i.test(inferImportsTool.description || '') ||
    !/ask the user/i.test(inferImportsTool.description || '') ||
    !/add_relations/i.test(inferImportsTool.description || '') ||
    !/`why`/i.test(inferImportsTool.description || '') ||
    !/Use after analyze_repo_structure/i.test(inferImportsTool.description || '') ||
    !/not just suggestedRelations heuristics/i.test(inferImportsTool.description || '') ||
    !/Single source of truth preserved/i.test(inferImportsTool.description || '')
  ) {
    return 'infer_imports description missing dependency-ingest safety guidance';
  }
  const inferMaxFilesSchema = propertyAt(inferImportsTool, ['properties', 'maxFiles']);
  if (
    inferMaxFilesSchema?.type !== 'integer' ||
    inferMaxFilesSchema.minimum !== 1 ||
    inferMaxFilesSchema.maximum !== 50000 ||
    !/default 5000/i.test(inferMaxFilesSchema.description || '') ||
    !/avoid pathological monorepos/i.test(inferMaxFilesSchema.description || '')
  ) {
    return 'infer_imports maxFiles hard-stop guidance drift';
  }
  const inferReviewModeSchema = propertyAt(inferImportsTool, ['properties', 'reviewMode']);
  if (
    inferReviewModeSchema?.type !== 'string' ||
    !sameArray(inferReviewModeSchema.enum, ['full', 'next', 'focus']) ||
    !/focus.*bounded exact file-level import neighborhood/i.test(inferReviewModeSchema.description || '') ||
    !/Omit for automatic delivery/i.test(inferReviewModeSchema.description || '') ||
    !/128 KiB/i.test(inferReviewModeSchema.description || '') ||
    !/full.*requests the complete scan/i.test(inferReviewModeSchema.description || '') ||
    !/allowLargeResponse:true/i.test(inferReviewModeSchema.description || '') ||
    !/next.*explicitly requests one compact packet/i.test(inferReviewModeSchema.description || '')
  ) {
    return 'infer_imports reviewMode contract drift';
  }
  const inferAllowLargeResponseSchema = propertyAt(inferImportsTool, [
    'properties',
    'allowLargeResponse',
  ]);
  if (
    inferAllowLargeResponseSchema?.type !== 'boolean' ||
    !/reviewMode:"full"/i.test(inferAllowLargeResponseSchema.description || '') ||
    !/exceeds 128 KiB/i.test(inferAllowLargeResponseSchema.description || '')
  ) {
    return 'infer_imports large response confirmation drift';
  }
  const inferAfterReviewIdSchema = propertyAt(inferImportsTool, ['properties', 'afterReviewId']);
  if (
    inferAfterReviewIdSchema?.type !== 'string' ||
    !/reviewMode:"next"/i.test(inferAfterReviewIdSchema.description || '') ||
    !/cursor\.nextAfterReviewId/i.test(inferAfterReviewIdSchema.description || '')
  ) {
    return 'infer_imports afterReviewId cursor drift';
  }
  const inferFocusPathSchema = propertyAt(inferImportsTool, ['properties', 'focusPath']);
  const inferFocusDirectionSchema = propertyAt(inferImportsTool, ['properties', 'focusDirection']);
  const inferFocusLimitSchema = propertyAt(inferImportsTool, ['properties', 'focusLimit']);
  const inferFocusAfterEdgeIdSchema = propertyAt(inferImportsTool, ['properties', 'focusAfterEdgeId']);
  if (
    inferFocusPathSchema?.type !== 'string' ||
    !/repository-relative implementation file/i.test(inferFocusPathSchema.description || '') ||
    !sameArray(inferFocusDirectionSchema?.enum, ['incoming', 'outgoing', 'both']) ||
    inferFocusLimitSchema?.type !== 'integer' ||
    inferFocusLimitSchema.minimum !== 1 ||
    inferFocusLimitSchema.maximum !== 100 ||
    inferFocusAfterEdgeIdSchema?.type !== 'string' ||
    !/nextAfterEdgeId/i.test(inferFocusAfterEdgeIdSchema.description || '')
  ) {
    return 'infer_imports focus input contract drift';
  }
  if (inferImportsTool.outputSchema?.type !== 'object') {
    return 'infer_imports outputSchema root drift';
  }
  if (!sameArray(inferImportsTool.outputSchema?.required, ['rootPath', 'filesScanned', 'coverage'])) {
    return 'infer_imports outputSchema required drift';
  }
  const inferOutputBranches = inferImportsTool.outputSchema?.oneOf;
  if (
    !Array.isArray(inferOutputBranches) ||
    inferOutputBranches.length !== 3 ||
    !sameArray(inferOutputBranches[0]?.required, ['edges', 'externalImports', 'unresolved', 'moduleEdges']) ||
    !sameArray(inferOutputBranches[1]?.required, [
      'contract',
      'scanSummary',
      'reconciliationSummary',
      'reviewQueue',
      'nextReview',
    ]) ||
    !sameArray(inferOutputBranches[2]?.required, ['contract', 'scanSummary', 'focusReview'])
  ) {
    return 'infer_imports outputSchema full/review branch drift';
  }
  if (inferImportsTool.outputSchema?.additionalProperties !== false) {
    return 'infer_imports outputSchema root openness drift';
  }
  if (outputPropertyAt(inferImportsTool, ['properties', 'rootPath'])?.type !== 'string') {
    return 'infer_imports outputSchema rootPath drift';
  }
  const filesScannedSchema = outputPropertyAt(inferImportsTool, ['properties', 'filesScanned']);
  if (filesScannedSchema?.type !== 'integer' || filesScannedSchema.minimum !== 0) {
    return 'infer_imports outputSchema filesScanned drift';
  }
  const importCoverageSchema = outputPropertyAt(inferImportsTool, ['properties', 'coverage']);
  if (
    importCoverageSchema?.type !== 'object' ||
    !sameArray(importCoverageSchema.properties?.contract?.enum, ['importScanCoverage:v1']) ||
    !sameArray(
      importCoverageSchema.properties?.detectedUnsupportedLanguages?.items?.enum,
      ['c'],
    ) ||
    importCoverageSchema.properties?.allDetectedLanguagesSupported?.type !== 'boolean' ||
    Object.hasOwn(importCoverageSchema.properties ?? {}, 'completeForDetectedLanguages') ||
    !sameArray(importCoverageSchema.properties?.zeroEdgesMeaning?.enum, [
      'no_supported_static_import_edges_observed',
    ])
  ) {
    return 'infer_imports outputSchema coverage safety drift';
  }
  const importEdgeSchema = outputPropertyAt(inferImportsTool, ['properties', 'edges']);
  if (
    importEdgeSchema?.type !== 'array' ||
    importEdgeSchema.items?.type !== 'object' ||
    !sameArray(importEdgeSchema.items?.required, ['from', 'to', 'kind', 'sourceRole', 'importUsage'])
  ) {
    return 'infer_imports outputSchema edges drift';
  }
  if (importEdgeSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema edge openness drift';
  }
  if (!sameArray(importEdgeSchema.items?.properties?.kind?.enum, IMPORT_EDGE_KIND_VALUES)) {
    return 'infer_imports outputSchema edge kind drift';
  }
  if (
    !sameArray(importEdgeSchema.items?.properties?.sourceRole?.enum, IMPORT_SOURCE_ROLE_VALUES) ||
    !sameArray(importEdgeSchema.items?.properties?.importUsage?.enum, IMPORT_USAGE_VALUES)
  ) {
    return 'infer_imports outputSchema edge provenance drift';
  }
  const externalImportsSchema = outputPropertyAt(inferImportsTool, ['properties', 'externalImports']);
  if (
    externalImportsSchema?.type !== 'array' ||
    externalImportsSchema.items?.type !== 'object' ||
    !sameArray(externalImportsSchema.items?.required, ['from', 'spec'])
  ) {
    return 'infer_imports outputSchema externalImports drift';
  }
  if (externalImportsSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema externalImports openness drift';
  }
  const unresolvedSchema = outputPropertyAt(inferImportsTool, ['properties', 'unresolved']);
  if (
    unresolvedSchema?.type !== 'array' ||
    unresolvedSchema.items?.type !== 'object' ||
    !sameArray(unresolvedSchema.items?.required, ['from', 'spec', 'reason'])
  ) {
    return 'infer_imports outputSchema unresolved drift';
  }
  if (unresolvedSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema unresolved openness drift';
  }
  if (!sameArray(unresolvedSchema.items?.properties?.reason?.enum, IMPORT_UNRESOLVED_REASON_VALUES)) {
    return 'infer_imports outputSchema unresolved reason drift';
  }
  const moduleEdgesSchema = outputPropertyAt(inferImportsTool, ['properties', 'moduleEdges']);
  if (
    moduleEdgesSchema?.type !== 'array' ||
    moduleEdgesSchema.items?.type !== 'object' ||
    !sameArray(moduleEdgesSchema.items?.required, [
      'from',
      'to',
      'count',
      'kindCounts',
      'sourceRoleCounts',
      'importUsageCounts',
      'productValueCount',
      'evidence',
      'evidenceLimited',
    ])
  ) {
    return 'infer_imports outputSchema moduleEdges drift';
  }
  if (moduleEdgesSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema moduleEdges openness drift';
  }
  if (moduleEdgesSchema.items?.properties?.count?.type !== 'integer' || moduleEdgesSchema.items?.properties?.count?.minimum !== 1) {
    return 'infer_imports outputSchema moduleEdges count drift';
  }
  const moduleKindCountsSchema = moduleEdgesSchema.items?.properties?.kindCounts;
  const moduleKindCountKeys = IMPORT_EDGE_KIND_VALUES;
  if (
    moduleKindCountsSchema?.type !== 'object' ||
    moduleKindCountsSchema.additionalProperties !== false ||
    moduleKindCountsSchema.minProperties !== 1 ||
    !moduleKindCountsSchema.properties ||
    moduleKindCountKeys.some((kind) => (
      moduleKindCountsSchema.properties?.[kind]?.type !== 'integer' ||
      moduleKindCountsSchema.properties?.[kind]?.minimum !== 1
    ))
  ) {
    return 'infer_imports outputSchema moduleEdges kindCounts drift';
  }
  if (
    fixedZeroCountSchemaFailure(
      moduleEdgesSchema.items?.properties?.sourceRoleCounts,
      IMPORT_SOURCE_ROLE_VALUES,
    ) ||
    fixedZeroCountSchemaFailure(
      moduleEdgesSchema.items?.properties?.importUsageCounts,
      IMPORT_USAGE_VALUES,
    ) ||
    moduleEdgesSchema.items?.properties?.productValueCount?.type !== 'integer' ||
    moduleEdgesSchema.items?.properties?.productValueCount?.minimum !== 0
  ) {
    return 'infer_imports outputSchema moduleEdges evidence qualification drift';
  }
  const moduleEvidenceSchema = moduleEdgesSchema.items?.properties?.evidence;
  if (
    moduleEvidenceSchema?.type !== 'array' ||
    moduleEvidenceSchema.maxItems !== 5 ||
    moduleEvidenceSchema.items?.type !== 'object' ||
    !sameArray(moduleEvidenceSchema.items?.required, ['from', 'to', 'kind', 'sourceRole', 'importUsage']) ||
    moduleEvidenceSchema.items?.additionalProperties !== false ||
    !sameArray(moduleEvidenceSchema.items?.properties?.kind?.enum, IMPORT_EDGE_KIND_VALUES) ||
    !sameArray(moduleEvidenceSchema.items?.properties?.sourceRole?.enum, IMPORT_SOURCE_ROLE_VALUES) ||
    !sameArray(moduleEvidenceSchema.items?.properties?.importUsage?.enum, IMPORT_USAGE_VALUES) ||
    moduleEdgesSchema.items?.properties?.evidenceLimited?.type !== 'boolean'
  ) {
    return 'infer_imports outputSchema moduleEdges evidence drift';
  }
  const importReviewContractSchema = outputPropertyAt(inferImportsTool, ['properties', 'contract']);
  const importDeliverySchema = outputPropertyAt(inferImportsTool, ['properties', 'delivery']);
  const importNextReviewSchema = outputPropertyAt(inferImportsTool, ['properties', 'nextReview']);
  const importFocusReviewSchema = outputPropertyAt(inferImportsTool, ['properties', 'focusReview']);
  const importReviewWriteAllowedSchema = importNextReviewSchema?.properties?.writeAllowed;
  const importReviewCursorSchema = importNextReviewSchema?.properties?.cursor;
  const importReviewCandidateSchema = importNextReviewSchema?.properties?.candidate;
  const importReviewQualificationSchema = importReviewCandidateSchema?.properties?.evidenceQualification;
  const importEndpointModellingSchema = importNextReviewSchema?.properties?.endpointModelling;
  const importAddConceptsStepSchema = importEndpointModellingSchema?.properties?.addConceptsStep;
  const importFieldsAfterKindSchema = importAddConceptsStepSchema?.properties?.fieldsAfterKindDecision;
  const importFieldsByKindSchema = importFieldsAfterKindSchema?.properties?.byKind;
  const importEndpointDraftsSchema = importAddConceptsStepSchema?.properties?.endpointDrafts;
  const importEndpointDraftSchema = importAddConceptsStepSchema?.properties?.endpointDrafts?.items;
  const importReviewDecisionSchema = importNextReviewSchema?.properties?.decision;
  if (
    !sameArray(importReviewContractSchema?.enum, ['inferImportsReview:v1', 'inferImportsFocus:v1']) ||
    importDeliverySchema?.type !== 'object' ||
    !sameArray(importDeliverySchema?.required, [
      'selection',
      'reason',
      'estimatedFullResponseBytes',
      'automaticLimitBytes',
      'explicitFullAvailable',
      'explicitFullArguments',
    ]) ||
    !sameArray(importDeliverySchema?.properties?.selection?.enum, ['automatic_compact']) ||
    !sameArray(importDeliverySchema?.properties?.reason?.enum, [
      'estimated_full_response_exceeds_limit',
    ]) ||
    !sameArray(importDeliverySchema?.properties?.automaticLimitBytes?.enum, [131072]) ||
    !sameArray(importDeliverySchema?.properties?.explicitFullAvailable?.enum, [true]) ||
    !sameArray(importDeliverySchema?.properties?.explicitFullArguments?.required, [
      'reviewMode',
      'allowLargeResponse',
    ]) ||
    !sameArray(
      importDeliverySchema?.properties?.explicitFullArguments?.properties?.reviewMode?.enum,
      ['full'],
    ) ||
    !sameArray(
      importDeliverySchema?.properties?.explicitFullArguments?.properties?.allowLargeResponse?.enum,
      [true],
    ) ||
    importDeliverySchema?.additionalProperties !== false ||
    !sameArray(importNextReviewSchema?.type, ['object', 'null']) ||
    !sameArray(importNextReviewSchema?.required, [
      'contract',
      'reviewId',
      'status',
      'writeAllowed',
      'sourceQualification',
      'ordering',
      'candidate',
      'endpointModelling',
      'nextCalls',
      'decision',
      'cursor',
    ]) ||
    importNextReviewSchema?.additionalProperties !== false ||
    !sameArray(importReviewWriteAllowedSchema?.enum, [false]) ||
    !sameArray(importReviewCandidateSchema?.required, [
      'from',
      'to',
      'relationType',
      'absentEndpoints',
      'importCount',
      'sourceEvidence',
      'sourceEvidenceLimited',
      'evidenceQualification',
    ]) ||
    !sameArray(importReviewQualificationSchema?.required, [
      'basis',
      'sourceRoleCounts',
      'importUsageCounts',
      'productValueCount',
      'status',
    ]) ||
    !sameArray(importEndpointModellingSchema?.type, ['object', 'null']) ||
    !sameArray(importEndpointModellingSchema?.required, [
      'status',
      'writeAllowed',
      'absentEndpoints',
      'observedPathsByEndpoint',
      'analysisCall',
      'addConceptsStep',
      'resumeCall',
    ]) ||
    !sameArray(importEndpointModellingSchema?.properties?.status?.enum, [
      'required_before_relation_review',
    ]) ||
    !sameArray(importEndpointModellingSchema?.properties?.writeAllowed?.enum, [false]) ||
    !sameArray(importEndpointModellingSchema?.properties?.analysisCall?.properties?.tool?.enum, [
      'analyze_repo_structure',
    ]) ||
    !sameArray(importEndpointModellingSchema?.properties?.addConceptsStep?.properties?.tool?.enum, [
      'add_concepts',
    ]) ||
    !sameArray(importAddConceptsStepSchema?.required, [
      'tool',
      'fieldsAfterKindDecision',
      'endpointDrafts',
      'purpose',
    ]) ||
    importAddConceptsStepSchema?.additionalProperties !== false ||
    !sameArray(importFieldsAfterKindSchema?.required, ['common', 'byKind']) ||
    importFieldsAfterKindSchema?.additionalProperties !== false ||
    importFieldsAfterKindSchema?.properties?.common?.type !== 'array' ||
    importFieldsAfterKindSchema?.properties?.common?.minItems !== 5 ||
    importFieldsAfterKindSchema?.properties?.common?.maxItems !== 5 ||
    importFieldsAfterKindSchema?.properties?.common?.uniqueItems !== true ||
    importFieldsAfterKindSchema?.properties?.common?.items?.type !== 'string' ||
    !sameArray(importFieldsAfterKindSchema?.properties?.common?.items?.enum, [
      'slug', 'title', 'definition', 'evidence', 'confidence',
    ]) ||
    importFieldsByKindSchema?.type !== 'object' ||
    !sameArray(importFieldsByKindSchema?.required, [
      'project', 'domain', 'capability', 'element',
    ]) ||
    importFieldsByKindSchema?.additionalProperties !== false ||
    importFieldsByKindSchema?.properties?.project?.type !== 'array' ||
    importFieldsByKindSchema?.properties?.project?.maxItems !== 0 ||
    importFieldsByKindSchema?.properties?.domain?.type !== 'array' ||
    importFieldsByKindSchema?.properties?.domain?.maxItems !== 0 ||
    importFieldsByKindSchema?.properties?.capability?.type !== 'array' ||
    importFieldsByKindSchema?.properties?.capability?.minItems !== 1 ||
    importFieldsByKindSchema?.properties?.capability?.maxItems !== 1 ||
    importFieldsByKindSchema?.properties?.capability?.items?.type !== 'string' ||
    !sameArray(importFieldsByKindSchema?.properties?.capability?.items?.enum, ['domain']) ||
    importFieldsByKindSchema?.properties?.element?.type !== 'array' ||
    importFieldsByKindSchema?.properties?.element?.minItems !== 2 ||
    importFieldsByKindSchema?.properties?.element?.maxItems !== 2 ||
    importFieldsByKindSchema?.properties?.element?.uniqueItems !== true ||
    importFieldsByKindSchema?.properties?.element?.items?.type !== 'string' ||
    !sameArray(importFieldsByKindSchema?.properties?.element?.items?.enum, ['domain', 'path']) ||
    importEndpointDraftsSchema?.type !== 'array' ||
    importEndpointDraftsSchema?.minItems !== 1 ||
    importEndpointDraftsSchema?.maxItems !== 2 ||
    importEndpointDraftSchema?.type !== 'object' ||
    !sameArray(importEndpointDraftSchema?.required, [
      'endpoint', 'observedPaths', 'slugCandidate', 'kindDecision',
    ]) ||
    importEndpointDraftSchema?.additionalProperties !== false ||
    nonBlankStringSchemaFailure(importEndpointDraftSchema?.properties?.endpoint) ||
    importEndpointDraftSchema?.properties?.observedPaths?.type !== 'array' ||
    importEndpointDraftSchema?.properties?.observedPaths?.uniqueItems !== true ||
    nonBlankStringSchemaFailure(importEndpointDraftSchema?.properties?.observedPaths?.items) ||
    nonBlankStringSchemaFailure(importEndpointDraftSchema?.properties?.slugCandidate) ||
    importEndpointDraftSchema?.properties?.kindDecision?.type !== 'string' ||
    !sameArray(importEndpointDraftSchema?.properties?.kindDecision?.enum, [
      'human_meaning_required',
    ]) ||
    !sameArray(importEndpointModellingSchema?.properties?.resumeCall?.properties?.tool?.enum, [
      'infer_imports',
    ]) ||
    importNextReviewSchema?.properties?.nextCalls?.minItems !== 0 ||
    importNextReviewSchema?.properties?.nextCalls?.maxItems !== 2 ||
    !sameArray(importReviewDecisionSchema?.properties?.questionEligibility?.enum, [
      'blocked_missing_vault_endpoints',
      'eligible_after_semantic_review',
      'additional_product_meaning_evidence_required',
    ]) ||
    importReviewCursorSchema?.type !== 'object' ||
    !sameArray(importReviewCursorSchema?.required, [
      'afterReviewId',
      'total',
      'remaining',
      'hasMore',
      'nextAfterReviewId',
    ]) ||
    importReviewCursorSchema?.additionalProperties !== false
  ) {
    return 'infer_imports compact review approval gate drift';
  }
  if (
    importFocusReviewSchema?.type !== 'object' ||
    !sameArray(importFocusReviewSchema.required, [
      'contract',
      'focusPath',
      'direction',
      'sourceQualification',
      'writeAllowed',
      'summary',
      'edges',
      'cursor',
      'interpretation',
    ]) ||
    importFocusReviewSchema.additionalProperties !== false ||
    !sameArray(importFocusReviewSchema.properties?.contract?.enum, ['importImpactFocus:v1']) ||
    !sameArray(importFocusReviewSchema.properties?.writeAllowed?.enum, [false]) ||
    importFocusReviewSchema.properties?.edges?.maxItems !== 100 ||
    !sameArray(importFocusReviewSchema.properties?.edges?.items?.required, [
      'edgeId',
      'from',
      'to',
      'kind',
      'sourceRole',
      'importUsage',
    ]) ||
    importFocusReviewSchema.properties?.edges?.items?.additionalProperties !== false ||
    !sameArray(importFocusReviewSchema.properties?.cursor?.required, [
      'afterEdgeId',
      'total',
      'remaining',
      'hasMore',
      'nextAfterEdgeId',
    ])
  ) {
    return 'infer_imports focus output contract drift';
  }
  return null;
}

function fixedZeroCountSchemaFailure(schema, values) {
  return !schema ||
    schema.type !== 'object' ||
    schema.additionalProperties !== false ||
    !sameArray(schema.required, values) ||
    values.some(
      (value) =>
        schema.properties?.[value]?.type !== 'integer' ||
        schema.properties?.[value]?.minimum !== 0,
    );
}
