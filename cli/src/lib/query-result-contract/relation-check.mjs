import { assertQueryOperation } from './query-operation.mjs';
import { hasNonEmptyString, isPlainObject, validCount } from './value-checks.mjs';

const RELATION_CHECK_VERDICTS = new Set([
  'already_exists',
  'matches_existing_schema',
  'new_schema_pattern',
]);
export const RELATION_CHECK_DECISIONS = new Set([
  'skip_existing',
  'review_inverse',
  'safe_to_add',
  'review_new_schema',
]);
export const RELATION_CHECK_RECOMMENDATION_SEVERITIES = new Set(['info', 'warn']);

export function assertRelationCheckShape(result) {
  assertQueryOperation(result, 'relation_check');
  for (const field of ['from', 'to', 'relation', 'fromKind', 'toKind', 'verdict']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`relation_check ${field} must be a non-empty string`);
    }
  }
  if (typeof result.exists !== 'boolean') {
    throw new Error('relation_check exists must be a boolean');
  }
  if (!RELATION_CHECK_VERDICTS.has(result.verdict)) {
    throw new Error(`relation_check verdict must be one of: ${[...RELATION_CHECK_VERDICTS].join(', ')}`);
  }
  if (!validRelationCheckRecommendation(result.recommendation)) {
    throw new Error('relation_check recommendation must include decision, severity, and reason');
  }
  if (!Array.isArray(result.matchingEdges)) {
    throw new Error('relation_check matchingEdges must be an array');
  }
  for (let index = 0; index < result.matchingEdges.length; index += 1) {
    if (!validRelationCheckEdge(result.matchingEdges[index])) {
      throw new Error(`relation_check matchingEdges[${index}] has an invalid edge shape`);
    }
  }
  if (!Array.isArray(result.inverseEdges)) {
    throw new Error('relation_check inverseEdges must be an array');
  }
  for (let index = 0; index < result.inverseEdges.length; index += 1) {
    if (!validRelationCheckEdge(result.inverseEdges[index])) {
      throw new Error(`relation_check inverseEdges[${index}] has an invalid edge shape`);
    }
  }
  if (result.schemaPattern !== null && result.schemaPattern !== undefined && !validRelationCheckPattern(result.schemaPattern)) {
    throw new Error('relation_check schemaPattern must be a valid schema-pattern row when present');
  }
  if (!Array.isArray(result.nearbyPatterns)) {
    throw new Error('relation_check nearbyPatterns must be an array');
  }
  for (let index = 0; index < result.nearbyPatterns.length; index += 1) {
    if (!validRelationCheckPattern(result.nearbyPatterns[index], { requireSimilarity: true })) {
      throw new Error(`relation_check nearbyPatterns[${index}] has an invalid schema-pattern shape`);
    }
  }
  if (result.exists && result.proposedAction !== null && result.proposedAction !== undefined) {
    throw new Error('relation_check existing edge must not include proposedAction');
  }
  if (result.exists && result.approvalGate !== null && result.approvalGate !== undefined) {
    throw new Error('relation_check existing edge must not include approvalGate');
  }
  if (!result.exists && result.relation === 'dependencies') {
    if (result.proposedAction !== null) {
      throw new Error('relation_check pending depends_on must not include proposedAction before semantic approval');
    }
    if (!validRelationCheckApprovalGate(result.approvalGate)) {
      throw new Error('relation_check pending depends_on must include the non-writing semantic approvalGate');
    }
  } else if (!result.exists && !validRelationCheckProposedAction(result)) {
    throw new Error('relation_check missing edge must include add_relation proposedAction with matching args');
  }
  return result;
}

function validRelationCheckRecommendation(recommendation) {
  return Boolean(
    isPlainObject(recommendation)
    && RELATION_CHECK_DECISIONS.has(recommendation.decision)
    && RELATION_CHECK_RECOMMENDATION_SEVERITIES.has(recommendation.severity)
    && hasNonEmptyString(recommendation.reason)
  );
}

function validRelationCheckEdge(edge) {
  return Boolean(
    isPlainObject(edge)
    && hasNonEmptyString(edge.from)
    && hasNonEmptyString(edge.to)
    && hasNonEmptyString(edge.via)
    && (edge.ref === undefined || hasNonEmptyString(edge.ref))
    && (edge.resolved === undefined || typeof edge.resolved === 'boolean')
    && (edge.external === undefined || typeof edge.external === 'boolean')
  );
}

function validRelationCheckPattern(pattern, { requireSimilarity = false } = {}) {
  return Boolean(
    isPlainObject(pattern)
    && hasNonEmptyString(pattern.fromKind)
    && hasNonEmptyString(pattern.relation)
    && hasNonEmptyString(pattern.toKind)
    && validCount(pattern.count)
    && validCount(pattern.resolved ?? 0)
    && validCount(pattern.external ?? 0)
    && validCount(pattern.unresolved ?? 0)
    && (!requireSimilarity || (Number.isFinite(pattern.similarity) && pattern.similarity >= 0))
    && (pattern.examples === undefined || (
      Array.isArray(pattern.examples)
      && pattern.examples.every((example) => (
        isPlainObject(example)
        && hasNonEmptyString(example.from)
        && hasNonEmptyString(example.to)
        && (example.ref === undefined || hasNonEmptyString(example.ref))
      ))
    ))
  );
}

function validRelationCheckProposedAction(result) {
  const action = result.proposedAction;
  return Boolean(
    isPlainObject(action)
    && action.tool === 'add_relation'
    && isPlainObject(action.args)
    && action.args.from === result.from
    && action.args.to === result.to
    && relationTypesMatch(action.args.type, result.relation)
  );
}

function validRelationCheckApprovalGate(gate) {
  return Boolean(
    isPlainObject(gate)
    && gate.status === 'semantic_approval_required'
    && gate.writeAllowed === false
    && Array.isArray(gate.required)
    && ['observable_ability', 'semantic_rationale', 'explicit_human_approval', 'why']
      .every((item) => gate.required.includes(item))
    && hasNonEmptyString(gate.next)
  );
}

function relationTypesMatch(writeType, readType) {
  if (writeType === readType) return true;
  return writeType === 'depends_on' && readType === 'dependencies';
}
