import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { omittedLargeImports } from './bootstrap.mjs';

/**
 * Without `--vault`, an import graph too large to deliver is reported as omitted while the
 * structure-stage review plan still prints.
 */
describe('omittedLargeImports', () => {
  it('turns the oversize delivery refusal into an omitted envelope with both retries', () => {
    const omitted = omittedLargeImports(
      new Error('Estimated full response (3218324 bytes) exceeds the automatic 128 KiB delivery limit, but compact review requires reconcile:true and a loadable active vault.'),
      { target: '/repo', vaultRoot: '/tmp/scratch' },
    );
    assert.equal(omitted.status, 'omitted_large');
    assert.match(omitted.reason, /128 KiB/);
    assert.deepEqual(omitted.retry, [
      'node cli/src/index.mjs bootstrap /repo --vault <your vault> --json',
      'node cli/src/index.mjs infer-imports /repo --full --json',
    ]);
    assert.equal(omitted.vaultRootTried, '/tmp/scratch');
  });

  it('leaves every other failure to the existing exit-2 path', () => {
    assert.equal(omittedLargeImports(new Error('MCP server exited before responding'), {}), null);
    assert.equal(omittedLargeImports('plain string failure', {}), null);
    assert.equal(omittedLargeImports(null, {}), null);
  });
});
