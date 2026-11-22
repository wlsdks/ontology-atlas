import { sameArray } from '../value-checks.mjs';
import { nonBlankStringSchemaFailure, topLevelInputStringSchemaFailure } from './schema-primitives.mjs';

function meaningAssessmentOutputSchemaFailure(schema) {
  const required = ['contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance'];
  const properties = schema?.properties;
  const dimensions = properties?.dimensions;
  const structure = dimensions?.properties?.structure;
  const competency = dimensions?.properties?.competency;
  const question = competency?.properties?.questions?.items;
  const source = dimensions?.properties?.source;
  const provenance = properties?.provenance;
  const provenanceFields = [
    'evaluator',
    'graphHash',
    'competencyContract',
    'competencyEvaluator',
    'competencyGraphHash',
    'witnessInventoryContract',
    'witnessInventoryGraphHash',
    'witnessInventorySourceFingerprint',
    'sourceGraphHash',
    'sourceReceiptContractVersion',
    'sourceId',
    'sourceRevision',
    'sourceFingerprint',
    'sourceMeasuredAt',
    'sourceGapId',
  ];

  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, required) ||
    !sameArray(Object.keys(properties ?? {}), required) ||
    schema.additionalProperties !== false ||
    !sameArray(properties?.contract?.enum, ['meaningAssessment:v1']) ||
    !sameArray(properties?.projectSlug?.type, ['string', 'null']) ||
    !sameArray(properties?.status?.enum, ['verified_current', 'review_required', 'needs_evidence', 'invalid']) ||
    dimensions?.type !== 'object' ||
    !sameArray(dimensions.required, ['structure', 'competency', 'source']) ||
    !sameArray(Object.keys(dimensions.properties ?? {}), ['structure', 'competency', 'source']) ||
    dimensions.additionalProperties !== false ||
    !sameArray(structure?.required, ['status', 'basis']) ||
    structure?.additionalProperties !== false ||
    !sameArray(structure?.properties?.status?.enum, ['ready', 'needs_structure', 'invalid']) ||
    !sameArray(structure?.properties?.basis?.enum, ['structure_only']) ||
    !sameArray(competency?.required, ['status', 'questions']) ||
    competency?.additionalProperties !== false ||
    !sameArray(competency?.properties?.status?.enum, ['answered', 'needs_evidence']) ||
    competency?.properties?.questions?.type !== 'array' ||
    !sameArray(question?.required, ['id', 'status', 'witnessStatus']) ||
    question?.additionalProperties !== false ||
    nonBlankStringSchemaFailure(question?.properties?.id) ||
    !sameArray(question?.properties?.status?.enum, ['answered', 'partial', 'visible-gap', 'unassessed']) ||
    !sameArray(question?.properties?.witnessStatus?.enum, ['resolved', 'missing', 'unavailable']) ||
    !sameArray(source?.required, ['status', 'currentness']) ||
    source?.additionalProperties !== false ||
    !sameArray(source?.properties?.status?.enum, ['not_measured', 'needs_evidence', 'review_required', 'invalid', 'verified_current']) ||
    !sameArray(source?.properties?.currentness?.enum, ['current', 'stale', 'unavailable']) ||
    !sameArray(properties?.topGap?.type, ['object', 'null']) ||
    !sameArray(properties?.topGap?.required, ['dimension', 'id']) ||
    properties?.topGap?.additionalProperties !== false ||
    !sameArray(Object.keys(properties?.topGap?.properties ?? {}), ['dimension', 'id', 'questionId']) ||
    properties?.nextAction?.type !== 'object' ||
    !sameArray(properties?.nextAction?.required, ['id']) ||
    properties?.nextAction?.additionalProperties !== false ||
    !sameArray(Object.keys(properties?.nextAction?.properties ?? {}), ['id', 'target']) ||
    provenance?.type !== 'object' ||
    !sameArray(provenance.required, provenanceFields) ||
    !sameArray(Object.keys(provenance.properties ?? {}), provenanceFields) ||
    provenance.additionalProperties !== false
  ) return true;

  return false;
}

export function finalizeProjectMeaningSchemaFailure(tool) {
  if (
    tool?.inputSchema?.type !== 'object' ||
    !sameArray(tool.inputSchema.required, ['projectSlug', 'expected_mtime']) ||
    topLevelInputStringSchemaFailure(tool.inputSchema.properties?.projectSlug) ||
    tool.inputSchema.properties?.expected_mtime?.type !== 'number' ||
    tool.inputSchema.properties?.expected_mtime?.minimum !== 0
  ) {
    return 'finalize_project_meaning inputSchema conflict guard drift';
  }

  const output = tool.outputSchema;
  const required = [
    'ok',
    'changed',
    'contract',
    'projectSlug',
    'bodyDigest',
    'graphHash',
    'sourceFingerprint',
    'measuredAt',
    'meaningAssessment',
  ];
  if (
    output?.type !== 'object' ||
    !sameArray(output.required, required) ||
    !sameArray(Object.keys(output.properties ?? {}), required) ||
    output.additionalProperties !== false ||
    output.properties?.ok?.type !== 'boolean' ||
    output.properties?.changed?.type !== 'boolean' ||
    !sameArray(output.properties?.contract?.enum, ['projectMeaningReceipt:v1']) ||
    nonBlankStringSchemaFailure(output.properties?.projectSlug) ||
    output.properties?.bodyDigest?.pattern !== '^sha256:[a-f0-9]{64}$' ||
    output.properties?.graphHash?.pattern !== '^project-graph-v1:[a-f0-9]{8}$' ||
    nonBlankStringSchemaFailure(output.properties?.sourceFingerprint) ||
    output.properties?.measuredAt?.type !== 'string' ||
    output.properties?.measuredAt?.format !== 'date-time'
  ) {
    return 'finalize_project_meaning flat outputSchema drift';
  }
  if (meaningAssessmentOutputSchemaFailure(output.properties.meaningAssessment)) {
    return 'finalize_project_meaning meaningAssessment categorical/privacy contract drift';
  }
  return null;
}
