import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertConceptBatchResult,
  assertRelationBatchResult,
  formatConceptBatchFailureLabel,
  formatRelationBatchFailureLabel,
} from './batch-results.mjs';

describe('batch-results', () => {
  const postWriteMaintenance = {
    operation: 'maintenance_plan',
    summary: {
      totalActions: 1,
      filteredActions: 1,
      remainingActions: 1,
      executableActions: 1,
      reviewActions: 0,
    },
    filters: {
      executableOnly: false,
      phases: [],
      severities: [],
      kinds: [],
    },
    cursor: {
      afterActionId: null,
      found: true,
      reason: null,
      startIndex: 0,
      nextAfterActionId: 'maint_1',
      hasMore: false,
    },
    byPhase: { repair: 1 },
    bySeverity: { warn: 1 },
    byKind: { canonicalize_graph_arrays: 1 },
    limited: false,
    nextExecutableAction: {
      id: 'maint_1',
      phase: 'repair',
      kind: 'canonicalize_graph_arrays',
      severity: 'warn',
      executable: true,
    },
    nextReviewAction: null,
    actions: [
      {
        id: 'maint_1',
        phase: 'repair',
        kind: 'canonicalize_graph_arrays',
        severity: 'warn',
        executable: true,
        score: 100,
        reason: 'Canonicalize graph arrays.',
        node: { slug: 'capabilities/foo' },
        proposedAction: {
          tool: 'patch_concept',
          args: { slug: 'capabilities/foo', frontmatter: { dependencies: [] } },
        },
      },
    ],
    compiledSummary: {
      nodes: 2,
      edges: 1,
      issues: 0,
    },
  };

  it('accepts successful and row-level failed add_concepts rows', () => {
    const payload = {
      concepts: [
        {
          ok: true,
          slug: 'capabilities/a',
          filePath: '/vault/capabilities/a.md',
          changed: true,
          warnings: ['missing-expected-field:domain'],
        },
        {
          ok: false,
          slug: 'capabilities/a',
          error: 'concepts[1] duplicate slug in input batch; first seen at concepts[0]',
        },
      ],
    };

    assert.doesNotThrow(() => assertConceptBatchResult(payload));
    assert.doesNotThrow(() => assertConceptBatchResult(payload, 'add_concepts', { expectedCount: 2 }));
  });

  it('accepts valid post-write maintenance metadata on concept batch results', () => {
    const payload = {
      concepts: [{ ok: true, slug: 'capabilities/a', changed: true }],
      postWriteMaintenance,
    };

    assert.doesNotThrow(() => assertConceptBatchResult(payload));
  });

  it('formats concept failure rows without leaking undefined labels', () => {
    assert.equal(
      formatConceptBatchFailureLabel(
        {
          ok: false,
          slug: 'capabilities/a',
          error: 'concepts[1] duplicate slug in input batch; first seen at concepts[0]',
        },
        1,
      ),
      'capabilities/a',
    );
    assert.equal(
      formatConceptBatchFailureLabel({ ok: false, error: 'concepts[1] missing slug' }, 1),
      'concepts[1]',
    );
    assert.equal(
      formatConceptBatchFailureLabel({ ok: false, error: 'concepts[0] invalid' }, 0, 'concept'),
      'concept concepts[0]',
    );
  });

  it('rejects malformed add_concepts response rows before summaries trust them', () => {
    assert.throws(
      () => assertConceptBatchResult({ concepts: [{ ok: 'true', slug: 'capabilities/a' }] }),
      /add_concepts\.concepts\[0\]\.ok must be a boolean/,
    );
    assert.throws(
      () => assertConceptBatchResult({ concepts: [{ ok: false, slug: 'capabilities/a' }] }),
      /add_concepts\.concepts\[0\]\.error must be a non-empty string/,
    );
    assert.throws(
      () => assertConceptBatchResult({ concepts: [{ ok: true, slug: '   ' }] }),
      /add_concepts\.concepts\[0\]\.slug must be a non-empty string/,
    );
    assert.throws(
      () => assertConceptBatchResult({ concepts: [{ ok: true, slug: 'capabilities/a' }] }, 'add_concepts', { expectedCount: 2 }),
      /add_concepts\.concepts row count mismatch: expected 2, got 1/,
    );
    assert.throws(
      () => assertConceptBatchResult({
        concepts: [{ ok: true, slug: 'capabilities/a' }],
        postWriteMaintenance: { ...postWriteMaintenance, operation: 'health' },
      }),
      /add_concepts\.postWriteMaintenance invalid: maintenance_plan query returned unexpected operation: health/,
    );
  });

  it('accepts successful and row-level failed add_relations rows', () => {
    const payload = {
      relations: [
        {
          ok: true,
          from: 'project',
          to: 'domains/core',
          type: 'contains',
          alreadyExists: true,
          changed: false,
        },
        {
          ok: false,
          from: 'project',
          to: 'missing',
          type: 'contains',
          error: 'relations[1] target does not exist',
        },
      ],
    };

    assert.doesNotThrow(() => assertRelationBatchResult(payload));
    assert.doesNotThrow(() => assertRelationBatchResult(payload, 'add_relations chunk @0', { expectedCount: 2 }));
  });

  it('accepts valid post-write maintenance metadata on relation batch results', () => {
    const payload = {
      relations: [{ ok: true, from: 'project', to: 'domains/core', type: 'contains', changed: true }],
      postWriteMaintenance,
    };

    assert.doesNotThrow(() => assertRelationBatchResult(payload));
  });

  it('rejects malformed add_relations response rows with caller context', () => {
    assert.throws(
      () => assertRelationBatchResult({ relations: [{ ok: true, from: 'project', to: '', type: 'contains' }] }, 'add_relations chunk @50'),
      /add_relations chunk @50\.relations\[0\]\.to must be a non-empty string/,
    );
    assert.throws(
      () => assertRelationBatchResult({ relations: [{ ok: true, from: 'project', to: 'domains/core', type: 'contains', alreadyExists: 'yes' }] }),
      /add_relations\.relations\[0\]\.alreadyExists must be a boolean/,
    );
    assert.throws(
      () => assertRelationBatchResult({ relations: [{ ok: false, from: 'project', to: 'missing', type: 'contains' }] }),
      /add_relations\.relations\[0\]\.error must be a non-empty string/,
    );
    assert.throws(
      () => assertRelationBatchResult({ relations: [] }, 'add_relations chunk @50', { expectedCount: 1 }),
      /add_relations chunk @50\.relations row count mismatch: expected 1, got 0/,
    );
  });

  it('formats relation failure rows without leaking undefined labels', () => {
    assert.equal(
      formatRelationBatchFailureLabel(
        {
          ok: false,
          from: 'project',
          to: 'missing',
          type: 'contains',
          error: 'relations[1] target does not exist',
        },
        1,
      ),
      'project —contains→ missing',
    );
    assert.equal(
      formatRelationBatchFailureLabel({ ok: false, error: 'relations[2] missing type' }, 2),
      'relations[2]',
    );
    assert.equal(
      formatRelationBatchFailureLabel({ ok: false, error: 'relations[0] invalid' }, 0, 'import'),
      'import relations[0]',
    );
  });
});
