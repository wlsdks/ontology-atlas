import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertQueryOperation } from './query-operation.mjs';

describe('query-operation', () => {
  it('returns the result when the operation matches', () => {
    const result = { operation: 'health', status: 'healthy' };

    assert.equal(assertQueryOperation(result, 'health'), result);
  });

  it('rejects non-object responses', () => {
    assert.throws(
      () => assertQueryOperation(null, 'health'),
      /health query returned a non-object response/,
    );
    assert.throws(
      () => assertQueryOperation([], 'health'),
      /health query returned a non-object response/,
    );
  });

  it('rejects unexpected operations', () => {
    assert.throws(
      () => assertQueryOperation({ operation: 'workspace_brief' }, 'health'),
      /health query returned unexpected operation: workspace_brief/,
    );
  });
});
