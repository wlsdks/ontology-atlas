import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertQueryPlanShape } from './query-plan.mjs';

describe('query-plan', () => {
  it('validates query_plan execution advice payloads', () => {
    const valid = {
      operation: 'query_plan',
      targetOperation: 'all_paths',
      sideEffect: false,
      graph: { nodes: 3, edges: 2, resolvedEdges: 2, graphHash: 'abc123' },
      normalized: {
        targetOperation: 'all_paths',
        from: 'capabilities/start',
        to: 'capabilities/target',
        direction: 'undirected',
        maxHops: 4,
        limit: 100,
        searchBudget: 5000,
        types: null,
      },
      indexesUsed: ['aliasToSlug', 'in', 'out'],
      estimate: {
        strategy: 'bounded_path_enumeration',
        edgeScans: 20,
        reachableWithinDepth: 10,
        potentialPathUpperBound: 100,
        resultUpperBound: 100,
        costClass: 'high',
        frontierByDepth: [
          { distance: 1, frontierNodes: 1, candidateEdges: 20, newNodes: 20 },
        ],
      },
      warnings: ['all_paths may be truncated by limit; reduce maxHops or add relation types.'],
      execution: {
        shouldRun: false,
        nextStep: 'narrow',
        recommendation: 'Narrow the query before running it.',
        suggestedQuery: { operation: 'all_paths', from: 'capabilities/start', to: 'capabilities/target' },
        saferQuery: { operation: 'all_paths', from: 'capabilities/start', to: 'capabilities/target', maxHops: 3 },
      },
    };

    assert.equal(assertQueryPlanShape(valid, 'all_paths'), valid);
    assert.throws(
      () => assertQueryPlanShape({ ...valid, targetOperation: 'path' }, 'all_paths'),
      /query_plan targetOperation must be all_paths/,
    );
    assert.throws(
      () => assertQueryPlanShape({ ...valid, execution: { ...valid.execution, shouldRun: true, nextStep: 'narrow' } }, 'all_paths'),
      /query_plan execution has an invalid advice shape/,
    );
    assert.throws(
      () => assertQueryPlanShape({ ...valid, estimate: { ...valid.estimate, costClass: 'huge' } }, 'all_paths'),
      /query_plan estimate\.costClass must be low, medium, or high/,
    );
  });
});
