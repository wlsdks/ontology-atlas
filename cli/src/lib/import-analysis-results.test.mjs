import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertInferImportsResult } from './import-analysis-results.mjs';

describe('import-analysis-results', () => {
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
          filesScanned: -1,
          edges: [],
          externalImports: [],
          unresolved: [],
          moduleEdges: [],
        }),
      /infer_imports\.filesScanned must be a non-negative integer/,
    );
  });

  it('rejects malformed module edges before apply turns them into relations', () => {
    assert.throws(
      () =>
        assertInferImportsResult({
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
