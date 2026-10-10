import { assertQueryOperation } from './query-operation.mjs';
import { hasNonEmptyString, isPlainObject, validCount } from './value-checks.mjs';

const QUERY_PLAN_COST_CLASSES = new Set(['low', 'medium', 'high']);
const QUERY_PLAN_NEXT_STEPS = new Set(['run', 'review', 'narrow']);

export function assertQueryPlanShape(result, expectedTargetOperation) {
  assertQueryOperation(result, 'query_plan');
  if (expectedTargetOperation && result.targetOperation !== expectedTargetOperation) {
    throw new Error(`query_plan targetOperation must be ${expectedTargetOperation}`);
  }
  if (result.sideEffect !== false) {
    throw new Error('query_plan sideEffect must be false');
  }
  if (!isPlainObject(result.graph) || !validCount(result.graph.nodes) || !validCount(result.graph.edges)) {
    throw new Error('query_plan graph must include non-negative node and edge counts');
  }
  if (result.graph.resolvedEdges !== undefined && !validCount(result.graph.resolvedEdges)) {
    throw new Error('query_plan graph.resolvedEdges must be a non-negative integer when present');
  }
  if (result.graph.graphHash !== undefined && !hasNonEmptyString(result.graph.graphHash)) {
    throw new Error('query_plan graph.graphHash must be a non-empty string when present');
  }
  if (!isPlainObject(result.normalized) || result.normalized.targetOperation !== result.targetOperation) {
    throw new Error('query_plan normalized.targetOperation must match targetOperation');
  }
  if (!Array.isArray(result.indexesUsed) || !result.indexesUsed.every((index) => hasNonEmptyString(index))) {
    throw new Error('query_plan indexesUsed must be an array of non-empty strings');
  }
  if (!isPlainObject(result.estimate) || !hasNonEmptyString(result.estimate.strategy)) {
    throw new Error('query_plan estimate must include a strategy');
  }
  if (!QUERY_PLAN_COST_CLASSES.has(result.estimate.costClass)) {
    throw new Error('query_plan estimate.costClass must be low, medium, or high');
  }
  for (const field of ['edgeScans', 'nodeScans', 'reachableWithinDepth', 'potentialPathUpperBound', 'totalMatches', 'resultUpperBound']) {
    if (result.estimate[field] !== undefined && !validCount(result.estimate[field])) {
      throw new Error(`query_plan estimate.${field} must be a non-negative integer when present`);
    }
  }
  if (result.estimate.frontierByDepth !== undefined) {
    if (!Array.isArray(result.estimate.frontierByDepth)) {
      throw new Error('query_plan estimate.frontierByDepth must be an array when present');
    }
    for (let index = 0; index < result.estimate.frontierByDepth.length; index += 1) {
      if (!validFrontierRow(result.estimate.frontierByDepth[index])) {
        throw new Error(`query_plan estimate.frontierByDepth[${index}] has an invalid frontier row shape`);
      }
    }
  }
  if (!Array.isArray(result.warnings) || !result.warnings.every((warning) => hasNonEmptyString(warning))) {
    throw new Error('query_plan warnings must be an array of non-empty strings');
  }
  if (!validQueryPlanExecution(result.execution, result.targetOperation)) {
    throw new Error('query_plan execution has an invalid advice shape');
  }
  return result;
}

function validFrontierRow(row) {
  return Boolean(
    isPlainObject(row)
    && validCount(row.distance)
    && validCount(row.frontierNodes)
    && validCount(row.candidateEdges)
    && validCount(row.newNodes)
  );
}

function validQueryPlanExecution(execution, targetOperation) {
  return Boolean(
    isPlainObject(execution)
    && typeof execution.shouldRun === 'boolean'
    && QUERY_PLAN_NEXT_STEPS.has(execution.nextStep)
    && hasNonEmptyString(execution.recommendation)
    && validPlannedQuery(execution.suggestedQuery, targetOperation)
    && (execution.saferQuery === undefined || validPlannedQuery(execution.saferQuery, targetOperation))
    && ((execution.shouldRun && execution.nextStep === 'run') || (!execution.shouldRun && execution.nextStep !== 'run'))
  );
}

function validPlannedQuery(query, targetOperation) {
  return Boolean(
    isPlainObject(query)
    && query.operation === targetOperation
  );
}
