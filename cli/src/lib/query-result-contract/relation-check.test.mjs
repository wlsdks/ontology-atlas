import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertRelationCheckShape } from './relation-check.mjs';

describe('relation-check', () => {
  it('rejects malformed relation_check payloads before CLI output', () => {
    const missing = {
      operation: 'relation_check',
      from: 'capabilities/bar',
      to: 'domains/auth',
      relation: 'domain',
      fromKind: 'capability',
      toKind: 'domain',
      exists: false,
      verdict: 'matches_existing_schema',
      recommendation: {
        decision: 'safe_to_add',
        severity: 'info',
        reason: 'No exact or inverse edge found; capability --domain--> domain is an existing schema pattern.',
      },
      matchingEdges: [],
      inverseEdges: [],
      schemaPattern: {
        fromKind: 'capability',
        relation: 'domain',
        toKind: 'domain',
        count: 2,
        resolved: 2,
        external: 0,
        unresolved: 0,
        examples: [{ from: 'capabilities/foo', to: 'domains/auth', ref: 'capabilities/foo.domain' }],
      },
      nearbyPatterns: [
        {
          fromKind: 'capability',
          relation: 'relates',
          toKind: 'capability',
          count: 1,
          resolved: 1,
          external: 0,
          unresolved: 0,
          similarity: 1,
        },
      ],
      proposedAction: {
        tool: 'add_relation',
        args: { from: 'capabilities/bar', to: 'domains/auth', type: 'domain' },
      },
    };
    const existing = {
      ...missing,
      exists: true,
      verdict: 'already_exists',
      recommendation: {
        decision: 'skip_existing',
        severity: 'info',
        reason: 'Exact edge already exists; do not add another relation.',
      },
      matchingEdges: [{ from: 'capabilities/bar', to: 'domains/auth', via: 'domain', ref: 'capabilities/bar.domain' }],
      proposedAction: null,
    };

    assert.equal(assertRelationCheckShape(missing), missing);
    assert.equal(
      assertRelationCheckShape({
        ...missing,
        relation: 'dependencies',
        proposedAction: null,
        approvalGate: {
          status: 'semantic_approval_required',
          writeAllowed: false,
          required: ['observable_ability', 'semantic_rationale', 'explicit_human_approval', 'why'],
          next: 'Explain the ability, ask for approval, then write with why.',
        },
      }).approvalGate.writeAllowed,
      false,
    );
    assert.equal(assertRelationCheckShape(existing), existing);
    assert.throws(
      () => assertRelationCheckShape({ ...missing, exists: 'false' }),
      /relation_check exists must be a boolean/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, verdict: 'maybe' }),
      /relation_check verdict must be one of:/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, recommendation: { decision: 'maybe', severity: 'info', reason: 'x' } }),
      /relation_check recommendation must include decision, severity, and reason/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, recommendation: { decision: 'safe_to_add', severity: 'fail', reason: 'x' } }),
      /relation_check recommendation must include decision, severity, and reason/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, inverseEdges: 'nope' }),
      /relation_check inverseEdges must be an array/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, inverseEdges: [{ from: 'x' }] }),
      /relation_check inverseEdges\[0\] has an invalid edge shape/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, relation: 'dependencies', proposedAction: null }),
      /relation_check pending depends_on must include the non-writing semantic approvalGate/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...existing, proposedAction: missing.proposedAction }),
      /relation_check existing edge must not include proposedAction/,
    );
    assert.throws(
      () => assertRelationCheckShape({ ...missing, nearbyPatterns: [{ ...missing.nearbyPatterns[0], similarity: -1 }] }),
      /relation_check nearbyPatterns\[0\] has an invalid schema-pattern shape/,
    );
  });
});
