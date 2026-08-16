import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertInferImportsResult } from './import-analysis-results.mjs';

function coverageFixture() {
  return {
    contract: 'importScanCoverage:v1',
    supportedLanguages: ['go', 'javascript', 'python', 'typescript'],
    supportedExtensions: ['.go', '.js', '.py', '.ts'],
    detectedUnsupportedLanguages: [],
    allDetectedLanguagesSupported: true,
    zeroEdgesMeaning: 'no_supported_static_import_edges_observed',
    limitations: ['Static source evidence only; runtime execution is not inferred.'],
  };
}

function reconciliationSummaryFixture(overrides = {}) {
  return {
    inBoth: 0,
    inCodeMissingFromVault: 0,
    inCodeMissingEndpointAbsent: 105,
    inVaultNotInCode: 0,
    unresolvedImports: 2,
    hint: 'Review import-backed candidates before writing ontology relations.',
    ...overrides,
  };
}

function staleEdgeFollowUpFixture(count = 0) {
  return {
    status: count > 0 ? 'full_follow_up_required' : 'not_present',
    count,
    nextCall: count > 0
      ? {
          tool: 'infer_imports',
          arguments: { rootPath: '/repo', reviewMode: 'full', allowLargeResponse: true },
          purpose: 'Read full reconciliation before judging stale vault edges; compact delivery omits stale details.',
        }
      : null,
  };
}

function moduleEdgeFixture(overrides = {}) {
  return {
    from: 'capabilities/a',
    to: 'capabilities/b',
    count: 2,
    kindCounts: { static: 1, dynamic: 1 },
    sourceRoleCounts: { production: 2, test: 0, unknown: 0 },
    importUsageCounts: { value: 2, type_only: 0, unknown: 0 },
    productValueCount: 2,
    evidence: [{
      from: 'src/a.ts',
      to: 'src/b.ts',
      kind: 'static',
      sourceRole: 'production',
      importUsage: 'value',
    }],
    evidenceLimited: true,
    ...overrides,
  };
}

function goPackageImportEvidenceFixture(overrides = {}) {
  const row = {
    fromFile: 'cmd/sample/main.go',
    fromPackage: 'cmd/sample',
    toPackage: 'internal/store',
    importSpec: 'example.test/sample/internal/store',
    kind: 'static',
    sourceRole: 'production',
    importUsage: 'value',
  };
  return {
    contract: 'goPackageImports:v1',
    modulePath: 'example.test/sample',
    sourceQualification: 'observed_bounded_go_package_imports_not_runtime_or_semantic_impact',
    writeAllowed: false,
    filesScanned: 2,
    fileScanLimited: false,
    perFileByteLimit: 262144,
    perFileImportLimit: 256,
    skipped: [],
    limitations: [
      'External Go modules are not included in local package import evidence.',
      'Nested Go modules and go.work workspaces are not scanned.',
      'Observed imports are bounded static source evidence, not runtime execution or semantic depends_on approval.',
    ],
    packageImports: [row],
    moduleEdges: [{
      fromPackage: row.fromPackage,
      toPackage: row.toPackage,
      count: 1,
      kindCounts: { static: 1 },
      sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
      importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
      productValueCount: 1,
      evidence: [row],
      evidenceLimited: false,
    }],
    ...overrides,
  };
}

function goPackageImportEvidenceSummaryFixture(overrides = {}) {
  return {
    contract: 'goPackageImports:v1',
    filesScanned: 2,
    fileScanLimited: false,
    packageImports: 1,
    moduleEdges: 1,
    fullEvidenceCall: {
      tool: 'infer_imports',
      arguments: {
        rootPath: '/repo',
        sourceFolders: ['source'],
        ignore: ['generated'],
        maxFiles: 700,
        reviewMode: 'full',
        allowLargeResponse: true,
      },
      purpose: 'Read the complete typed Go package-import evidence.',
    },
    ...overrides,
  };
}

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
        contract: 'inferImportsReview:v1',
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
        coverage: coverageFixture(),
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        packageImportEvidenceSummary: goPackageImportEvidenceSummaryFixture(),
        reconciliationSummary: reconciliationSummaryFixture(),
        staleEdgeFollowUp: staleEdgeFollowUpFixture(),
        reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        nextReview: compactNextReviewFixture(),
      }),
    );
  });

  it('rejects malformed compact Go package-import summaries before they can hide a large scan', () => {
    const summary = goPackageImportEvidenceSummaryFixture({
      fullEvidenceCall: {
        tool: 'infer_imports',
        arguments: { rootPath: '/repo', reviewMode: 'full', allowLargeResponse: false },
        purpose: 'Read the complete typed Go package-import evidence.',
      },
    });
    assert.throws(
      () => assertInferImportsResult({
        contract: 'inferImportsReview:v1',
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
        coverage: coverageFixture(),
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        packageImportEvidenceSummary: summary,
        reconciliationSummary: reconciliationSummaryFixture(),
        staleEdgeFollowUp: staleEdgeFollowUpFixture(),
        reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        nextReview: compactNextReviewFixture(),
      }),
      /packageImportEvidenceSummary\.fullEvidenceCall\.arguments must request reviewMode full with allowLargeResponse true/,
    );
  });

  it('rejects a compact delivery that silently loses its review queue', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          contract: 'inferImportsReview:v1',
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
          coverage: coverageFixture(),
          scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
          reconciliationSummary: reconciliationSummaryFixture(),
          staleEdgeFollowUp: staleEdgeFollowUpFixture(),
          reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        }),
      /infer_imports\.nextReview must be an object/,
    );
  });

  it('rejects compact delivery metadata that lies about why it was compacted', () => {
    assert.throws(
      () => assertInferImportsResult({
        contract: 'inferImportsReview:v1',
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
        coverage: coverageFixture(),
        scanSummary: { fileEdges: 0, externalImports: 0, unresolvedImports: 0, moduleEdges: 0 },
        reconciliationSummary: reconciliationSummaryFixture(),
        staleEdgeFollowUp: staleEdgeFollowUpFixture(),
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
        contract: 'inferImportsReview:v1',
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
        coverage: coverageFixture(),
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        reconciliationSummary: reconciliationSummaryFixture(),
        staleEdgeFollowUp: staleEdgeFollowUpFixture(),
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
        contract: 'inferImportsReview:v1',
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
        coverage: coverageFixture(),
        scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
        reconciliationSummary: reconciliationSummaryFixture(),
        staleEdgeFollowUp: staleEdgeFollowUpFixture(),
        reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
        nextReview,
      }),
      /proposalValidation\.requiredProposalFields must be an array/,
    );
  });

  it('rejects MCP contract drift before a compact or full payload is consumed', () => {
    const compact = {
      contract: 'inferImportsReview:v1',
      delivery: {
        selection: 'automatic_compact',
        reason: 'estimated_full_response_exceeds_limit',
        estimatedFullResponseBytes: 716018,
        automaticLimitBytes: 131072,
        explicitFullAvailable: true,
        explicitFullArguments: { reviewMode: 'full', allowLargeResponse: true },
      },
      rootPath: '/repo',
      filesScanned: 1,
      coverage: coverageFixture(),
      scanSummary: { fileEdges: 0, externalImports: 0, unresolvedImports: 0, moduleEdges: 0 },
      reconciliationSummary: reconciliationSummaryFixture(),
      staleEdgeFollowUp: staleEdgeFollowUpFixture(),
      reviewQueue: { total: 0, returned: 0, exhausted: true, afterReviewId: null },
      nextReview: null,
    };
    const wrongContract = { ...compact, contract: 'inferImports:v1' };
    assert.throws(
      () => assertInferImportsResult(wrongContract),
      /contract must be inferImportsReview:v1/,
    );
    const missingCoverage = { ...compact, coverage: undefined };
    assert.throws(
      () => assertInferImportsResult(missingCoverage),
      /coverage must be an object/,
    );
    const missingGoCoverage = {
      ...compact,
      coverage: {
        ...coverageFixture(),
        supportedLanguages: ['javascript', 'python', 'typescript'],
      },
    };
    assert.throws(
      () => assertInferImportsResult(missingGoCoverage),
      /supportedLanguages must exactly match the public language contract/,
    );

    const full = {
      rootPath: '/repo',
      filesScanned: 1,
      coverage: coverageFixture(),
      edges: [{ from: 'src/a.ts', to: 'src/b.ts', kind: 'static' }],
      externalImports: [],
      unresolved: [],
      moduleEdges: [moduleEdgeFixture()],
    };
    assert.throws(
      () => assertInferImportsResult(full),
      /edges\[0\] has unexpected field|edges\[0\]\.sourceRole is invalid/,
    );
    const missingModuleEvidence = { ...full, edges: [], moduleEdges: [{ ...moduleEdgeFixture(), evidence: undefined }] };
    assert.throws(
      () => assertInferImportsResult(missingModuleEvidence),
      /moduleEdges\[0\]\.evidence must be an array/,
    );
    const missingCounts = { ...full, edges: [], moduleEdges: [{ ...moduleEdgeFixture(), sourceRoleCounts: undefined }] };
    assert.throws(
      () => assertInferImportsResult(missingCounts),
      /moduleEdges\[0\]\.sourceRoleCounts must be an object/,
    );
  });

  it('requires an explicit full follow-up when compact reconciliation has stale vault edges', () => {
    const compact = {
      contract: 'inferImportsReview:v1',
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
      coverage: coverageFixture(),
      scanSummary: { fileEdges: 277, externalImports: 1153, unresolvedImports: 2, moduleEdges: 105 },
      reconciliationSummary: reconciliationSummaryFixture({ inVaultNotInCode: 2 }),
      staleEdgeFollowUp: staleEdgeFollowUpFixture(2),
      reviewQueue: { total: 105, returned: 1, exhausted: false, afterReviewId: null },
      nextReview: compactNextReviewFixture(),
    };
    assert.doesNotThrow(() => assertInferImportsResult(compact));
    assert.throws(
      () => assertInferImportsResult({ ...compact, staleEdgeFollowUp: staleEdgeFollowUpFixture() }),
      /staleEdgeFollowUp\.count must match reconciliationSummary\.inVaultNotInCode/,
    );
    assert.throws(
      () => assertInferImportsResult({ ...compact, staleEdgeFollowUp: { ...staleEdgeFollowUpFixture(2), status: 'not_present' } }),
      /staleEdgeFollowUp\.status must be full_follow_up_required/,
    );
  });

  it('accepts infer_imports import graph payloads', () => {
    assert.doesNotThrow(() =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        coverage: coverageFixture(),
        edges: [{
          from: 'src/a.ts',
          to: 'src/b.ts',
          kind: 'static',
          sourceRole: 'production',
          importUsage: 'value',
        }],
        externalImports: [{ from: 'src/a.ts', spec: 'react' }],
        unresolved: [{ from: 'src/a.ts', spec: '@/missing', reason: 'alias-not-found' }],
        moduleEdges: [
          moduleEdgeFixture(),
        ],
      }),
    );
  });

  it('accepts a valid root Go package-import receipt without changing legacy file edges', () => {
    const coverage = coverageFixture();
    assert.doesNotThrow(() =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        coverage,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [],
        packageImportEvidence: goPackageImportEvidenceFixture(),
      }),
    );

    const undercounted = goPackageImportEvidenceFixture();
    undercounted.moduleEdges[0].productValueCount = 0;
    assert.throws(
      () => assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        coverage,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [],
        packageImportEvidence: undercounted,
      }),
      /productValueCount must equal production value imports/,
    );
  });

  it('accepts C as a detected unsupported import language', () => {
    const coverage = coverageFixture();
    coverage.detectedUnsupportedLanguages = ['c'];
    coverage.allDetectedLanguagesSupported = false;

    assert.doesNotThrow(() =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 0,
        coverage,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [],
      }),
    );
  });

  it('rejects malformed top-level import graph collections', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '',
          filesScanned: 1,
          coverage: coverageFixture(),
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
          coverage: coverageFixture(),
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
          coverage: coverageFixture(),
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
          coverage: coverageFixture(),
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
          coverage: coverageFixture(),
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [moduleEdgeFixture({ count: 0, kindCounts: {} })],
        }),
      /infer_imports\.moduleEdges\[0\]\.count must be a positive integer/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          coverage: coverageFixture(),
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [moduleEdgeFixture({ kindCounts: { static: 1 } })],
        }),
      /infer_imports\.moduleEdges\[0\]\.kindCounts total must equal count: count 2, kindCounts 1/,
    );
    assert.throws(
      () =>
        assertInferImportsResult({
          rootPath: '/repo',
          filesScanned: 1,
          coverage: coverageFixture(),
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [moduleEdgeFixture({ count: 1, kindCounts: { unknown: 1 } })],
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
      coverage: coverageFixture(),
      edges: [],
      externalImports: [],
      unresolved: [],
      moduleEdges: [moduleEdgeFixture({
        count: 1,
        kindCounts: { static: 1 },
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        evidence: [{
          from: 'src/a.ts',
          to: 'src/b.ts',
          kind: 'static',
          sourceRole: 'production',
          importUsage: 'value',
        }],
        evidenceLimited: false,
      })],
    }),
  );
  assert.throws(
    () =>
      assertInferImportsResult({
        rootPath: '/repo',
        filesScanned: 2,
        coverage: coverageFixture(),
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [moduleEdgeFixture({
          count: 1,
          kindCounts: { static: 1 },
          sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
          importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
          productValueCount: 1,
          evidence: [{
            from: '',
            to: 'src/b.ts',
            kind: 'static',
            sourceRole: 'production',
            importUsage: 'value',
          }],
          evidenceLimited: false,
        })],
      }),
    /moduleEdges\[0\]\.evidence\[0\]\.from must be a non-empty string/,
  );
});
