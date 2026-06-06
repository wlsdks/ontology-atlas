import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertAnalyzeRepoStructureResult } from './repo-analysis-results.mjs';

describe('repo-analysis-results', () => {
  it('accepts analyze_repo_structure candidate arrays and suggested relations', () => {
    assert.doesNotThrow(() =>
      assertAnalyzeRepoStructureResult({
        rootPath: '/repo',
        framework: 'fsd',
        project: { slug: 'demo', title: 'Demo' },
        domains: [{ slug: 'domains/core', title: 'Core', evidence: { source: 'README.md', line: 3 } }],
        capabilities: [{ slug: 'capabilities/auth', title: 'Auth', domain: 'domains/core', evidence: { source: 'src/features/auth' } }],
        elements: [{ slug: 'elements/src/app', title: 'App', domain: 'domains/core', evidence: { source: 'src/app/index.ts' } }],
        meaningGate: {
          policy: 'business-first',
          sourceStructureRole: 'implementation-evidence',
          businessOntology: {
            domains: ['domains/core'],
            capabilities: ['capabilities/auth'],
            evidence: [
              { slug: 'domains/core', kind: 'domain', source: 'README.md' },
              { slug: 'capabilities/auth', kind: 'capability', source: 'docs/ontology/capabilities/auth.md' },
            ],
          },
          implementationEvidence: {
            elements: ['elements/src/app'],
            reviewRequiredCapabilities: [
              {
                slug: 'capabilities/theme-toggle',
                reason: 'no README/domain evidence for business meaning',
                evidence: { source: 'src/features/theme-toggle' },
              },
            ],
          },
          reviewQuestions: ['What business/product meaning does this explain?'],
        },
        suggestedRelations: [{ from: 'demo', to: 'domains/core', type: 'contains' }],
        skipped: [{ path: 'node_modules', reason: 'ignored' }],
      }),
    );
  });

  it('rejects top-level fields that drift from the MCP output schema', () => {
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.rootPath must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'svelte',
          domains: [],
          capabilities: [],
          elements: [],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.framework must be one of fsd, next, generic/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          suggestedRelations: [],
        }),
      /analyze_repo_structure\.skipped must be an array/,
    );
  });

  it('rejects malformed candidate arrays before CLI output or apply trusts them', () => {
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          project: { slug: 'demo', title: 'Demo' },
          domains: {},
          capabilities: [],
          elements: [],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.domains must be an array/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [{ slug: 'capabilities/auth', title: 'Auth', domain: '', evidence: { source: 'src/features/auth' } }],
          elements: [],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.capabilities\[0\]\.domain must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [{ slug: 'elements/a' }],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.elements\[0\]\.title must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [{ slug: 'domains/core', title: 'Core' }],
          capabilities: [],
          elements: [],
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.domains\[0\]\.evidence must be an object/,
    );
  });

  it('rejects malformed suggested relation rows', () => {
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          suggestedRelations: [{ from: 'demo', to: 'domains/core', type: '' }],
          skipped: [],
        }),
      /analyze_repo_structure\.suggestedRelations\[0\]\.type must be a non-empty string/,
    );
  });

  it('rejects malformed skipped rows', () => {
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          suggestedRelations: [],
          skipped: [{ path: 'package.json', reason: '' }],
        }),
      /analyze_repo_structure\.skipped\[0\]\.reason must be a non-empty string/,
    );
  });

  it('rejects malformed meaning gate rows before CLI output or apply trusts them', () => {
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          meaningGate: {
            policy: '',
            sourceStructureRole: 'implementation-evidence',
            businessOntology: { domains: [], capabilities: [], evidence: [] },
            implementationEvidence: { elements: [], reviewRequiredCapabilities: [] },
            reviewQuestions: ['Review business/product meaning'],
          },
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.meaningGate\.policy must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          meaningGate: {
            policy: 'business-first',
            sourceStructureRole: 'implementation-evidence',
            businessOntology: { domains: ['domains/core'], capabilities: ['capabilities/auth', 7], evidence: [] },
            implementationEvidence: { elements: [], reviewRequiredCapabilities: [] },
            reviewQuestions: ['Review business/product meaning'],
          },
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.meaningGate\.businessOntology\.capabilities\[1\] must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          meaningGate: {
            policy: 'business-first',
            sourceStructureRole: 'implementation-evidence',
            businessOntology: { domains: [], capabilities: [], evidence: [] },
            implementationEvidence: { elements: ['elements/app'], reviewRequiredCapabilities: [] },
            reviewQuestions: [],
          },
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.meaningGate\.reviewQuestions must contain at least one item/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          meaningGate: {
            policy: 'business-first',
            sourceStructureRole: 'implementation-evidence',
            businessOntology: { domains: [], capabilities: [], evidence: [] },
            implementationEvidence: {
              elements: [],
              reviewRequiredCapabilities: [
                { slug: 'capabilities/theme-toggle', reason: '', evidence: { source: 'src/features/theme-toggle' } },
              ],
            },
            reviewQuestions: ['Review business/product meaning'],
          },
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.meaningGate\.implementationEvidence\.reviewRequiredCapabilities\[0\]\.reason must be a non-empty string/,
    );
    assert.throws(
      () =>
        assertAnalyzeRepoStructureResult({
          rootPath: '/repo',
          framework: 'generic',
          domains: [],
          capabilities: [],
          elements: [],
          meaningGate: {
            policy: 'business-first',
            sourceStructureRole: 'implementation-evidence',
            businessOntology: {
              domains: [],
              capabilities: [],
              evidence: [{ slug: 'capabilities/auth', kind: 'workflow', source: 'docs/ontology/capabilities/auth.md' }],
            },
            implementationEvidence: { elements: [], reviewRequiredCapabilities: [] },
            reviewQuestions: ['Review business/product meaning'],
          },
          suggestedRelations: [],
          skipped: [],
        }),
      /analyze_repo_structure\.meaningGate\.businessOntology\.evidence\[0\]\.kind must be one of domain, capability/,
    );
  });
});
