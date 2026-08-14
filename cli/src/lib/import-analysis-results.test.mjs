import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertInferImportsResult } from './import-analysis-results.mjs';

function compactNextReviewFixture() {
  return {
    contract: 'nextRelationReview:v1',
    reviewId: 'import-review:elements%2Fa:elements%2Fb',
    status: 'rationale_review_required',
    writeAllowed: false,
    sourceQualification: 'observed_this_call_not_relation_receipt',
    ordering: {
      basis: 'canonical_from_to',
      meaningConfidence: false,
      note: 'Queue order is deterministic review order, not evidence that this candidate is semantically stronger.',
    },
    candidate: {
      from: 'elements/a',
      to: 'elements/b',
      relationType: 'depends_on',
      absentEndpoints: ['elements/a', 'elements/b'],
      importCount: 1,
      sourceEvidence: [{ from: 'src/a.py', to: 'src/b.py', kind: 'static', sourceRole: 'production', importUsage: 'value' }],
      sourceEvidenceLimited: false,
      evidenceQualification: {
        basis: 'whole_module_edge',
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        status: 'product_value_observed',
      },
    },
    endpointModelling: {
      status: 'required_before_relation_review',
      writeAllowed: false,
      absentEndpoints: ['elements/a', 'elements/b'],
      observedPathsByEndpoint: [
        { endpoint: 'elements/a', paths: ['src/a.py'] },
        { endpoint: 'elements/b', paths: ['src/b.py'] },
      ],
      analysisCall: {
        tool: 'analyze_repo_structure',
        arguments: { rootPath: '/repo' },
        purpose: 'Refresh repository candidates and evidence only.',
      },
      proposalValidation: {
        tool: 'analyze_repo_structure',
        requiredArguments: ['rootPath', 'proposal'],
        requiredProposalFields: ['project', 'domains', 'capabilities', 'elements', 'relations', 'competencyAnswers'],
        fieldsAfterKindDecision: {
          common: ['slug', 'title', 'definition', 'evidence', 'confidence'],
          byKind: { project: [], domain: [], capability: ['domain'], element: ['domain', 'path'] },
        },
        endpointDrafts: [{
          endpoint: 'elements/a',
          observedPaths: ['src/a.py'],
          slugCandidate: 'elements/a',
          kindDecision: 'human_meaning_required',
        }],
        purpose: 'Build a complete proposal from reviewed product meaning.',
      },
      resumeCall: {
        tool: 'infer_imports',
        arguments: { rootPath: '/repo', reviewMode: 'next' },
        purpose: 'Restart the semantic queue after endpoint modelling.',
      },
    },
    nextCalls: [],
    decision: {
      questionEligibility: 'blocked_missing_vault_endpoints',
      required: ['vault_endpoints', 'semantic_rationale', 'human_approval'],
      ask: 'Do not ask for relation approval yet.',
      stopWhen: ['either endpoint meaning does not match the source files'],
    },
    cursor: {
      afterReviewId: null,
      total: 105,
      remaining: 104,
      hasMore: true,
      nextAfterReviewId: 'import-review:elements%2Fa:elements%2Fb',
    },
  };
}

describe('import-analysis-results', () => {
  it('accepts the bounded compact delivery returned for oversized scans', () => {
    assert.doesNotThrow(() =>
      assertInferImportsResult({
        contract: 'inferImports:v1',
        delivery: {
          selection: 'automatic_compact',
          reason: 'estimated_full_response_exceeds_limit',
          estimatedFullResponseBytes: 716018,
          automaticLimitBytes: 131072,
          explicitFullAvailable: true,
          explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
        },
        rootPath: '/repo',
        filesScanned: 237,
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        nextReview: compactNextReviewFixture(),
      }),
    );
  });

  it('rejects a compact delivery that silently loses its review queue', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          delivery: {
            selection: 'automatic_compact',
            reason: 'estimated_full_response_exceeds_limit',
            estimatedFullResponseBytes: 716018,
            automaticLimitBytes: 131072,
            explicitFullAvailable: true,
            explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
          },
          rootPath: '/repo',
          filesScanned: 237,
          scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
          reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        }),
      /infer_imports\.nextReview must be an object/,
    );
  });

  it('rejects compact delivery metadata that lies about why it was compacted', () => {
    assert.throws(
      () => assertInferImportsResult({
        delivery: {
          selection: 'automatic_compact',
          reason: 'unknown',
          estimatedFullResponseBytes: 716018,
          automaticLimitBytes: 131072,
          explicitFullAvailable: true,
          explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
        },
        rootPath: '/repo',
        filesScanned: 237,
        scanSummary: { fileEdges: 0, externalImports: 0, unresolvedImports: 0, moduleEdges: 0 },
        reviewQueue: { total: 0, returned: 0, exhausted: true, afterReviewId: null },
        nextReview: null,
      }),
      /delivery\.reason must be estimated_full_response_exceeds_limit/,
    );
  });

  it('rejects compact delivery rows outside the bounded queue cardinality', () => {
    const nextReview = compactNextReviewFixture();
    assert.throws(
      () => assertInferImportsResult({
        delivery: {
          selection: 'automatic_compact',
          reason: 'estimated_full_response_exceeds_limit',
          estimatedFullResponseBytes: 716018,
          automaticLimitBytes: 131072,
          explicitFullAvailable: true,
          explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
        },
        rootPath: '/repo',
        filesScanned: 237,
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        reviewQueue: { total: 105, returned: 2, exhausted: false, afterReviewId: null },
        nextReview,
      }),
      /reviewQueue\.returned must be 0 or 1/,
    );
  });

  it('rejects compact endpoint recovery when proposal validation loses a required field', () => {
    const nextReview = compactNextReviewFixture();
    delete nextReview.endpointModelling.proposalValidation.requiredProposalFields;
    assert.throws(
      () => assertInferImportsResult({
        delivery: {
          selection: 'automatic_compact',
          reason: 'estimated_full_response_exceeds_limit',
          estimatedFullResponseBytes: 716018,
          automaticLimitBytes: 131072,
          explicitFullAvailable: true,
          explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
        },
        rootPath: '/repo',
        filesScanned: 237,
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        nextReview,
      }),
      /proposalValidation\.requiredProposalFields must be an array/,
    );
  });

  it('accepts infer_imports import graph payloads', () => {
    assert.doesNotThrow(() =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        edges: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static' }],
        externalImports: [{ from: 'src/a.ts', spec: 'react' }],
        unresolved: [{ from: 'src/a.ts', spec: '@/missing', reason: 'alias-not-found' }],
        moduleEdges: [
          {
            from: 'capabilities/a',
            to: 'capabilities/b',
            count: 2,
            kindCounts: { static: 1, dynamic: 1 },
          },
        ],
      }),
    );
  });

  it('rejects malformed top-level import graph collections', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '',
          filesScanned: 1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [],
        }),
      /infer_imports\.rootPath must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          edges: {},
          externalImports: [],
          unresolved: [],
          moduleEdges: [],
        }),
      /infer_imports\.edges must be an array/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: -1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [],
        }),
      /infer_imports\.filesScanned must be a non-negative integer/,
    );
  });

  it('rejects unresolved import reasons outside the MCP output schema enum', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          edges: [],
          externalImports: [],
          unresolved: [{ from: 'src/a.ts', spec: '@/missing', reason: 'unresolved-alias' }],
          moduleEdges: [],
        }),
      /infer_imports\.unresolved\[0\]\.reason must be one of empty, relative-not-found, alias-not-found/,
    );
  });

  it('rejects malformed module edges before apply turns them into relations', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 0, kindCounts: {} }],
        }),
      /infer_imports\.moduleEdges\[0\]\.count must be a positive integer/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 2, kindCounts: { static: 1 } }],
        }),
      /infer_imports\.moduleEdges\[0\]\.kindCounts total must equal count: count 2, kindCounts 1/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1, kindCounts: { unknown: 1 } }],
        }),
      /infer_imports\.moduleEdges\[0\]\.kindCounts\.unknown must be one of/,
    );
  });
});

it('infer_imports module evidence는 bounded exact file edge 계약을 지킨다', () => {
  assert.doesNotThrow(() =>
    assertInferImportsResult({
      rootPath: '/repo',
      filesScanned: 2,
      edges: [],
      externalImports: [],
      unresolved: [],
      moduleEdges: [{
        from: 'capabilities/a',
        to: 'capabilities/b',
        count: 1,
        kindCounts: { static: 1 },
        evidence: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static' }],
        evidenceLimited: false,
      }],
    }),
  );
  assert.throws(
    () =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [{
          from: 'capabilities/a',
          to: 'capabilities/b',
          count: 1,
          kindCounts: { static: 1 },
          evidence: [{ from: '', to: 'src/b.ts', kind: 'static' }],
          evidenceLimited: false,
        }],
      }),
    /moduleEdges\[0\]\.evidence\[0\]\.from must be a non-empty string/,
  );
});
