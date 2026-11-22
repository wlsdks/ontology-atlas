import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { protectionFrom, readOutcome } from './github-cli.mjs';

describe('what a gh reply means', () => {
  it('tells a ref that is absent from a request that did not happen', () => {
    assert.deepEqual(readOutcome({ failed: true, output: 'gh: Not Found (HTTP 404)' }), { value: null, failure: null });
    assert.equal(readOutcome({ failed: true, output: '{"message":"API rate limit exceeded for user ID 1"}' }).failure.reason, 'rate-limited');
    assert.equal(readOutcome({ failed: true, output: 'dial tcp: lookup api.github.com: no such host' }).failure.reason, 'unreachable');
    assert.deepEqual(readOutcome('{"object":{"sha":"abc"}}').value, { object: { sha: 'abc' } });
  });

  it('never lets a failed read accuse main of having no gate', () => {
    assert.equal(protectionFrom(readOutcome({ failed: true, output: 'API rate limit exceeded' })).contexts, null);
    assert.equal(protectionFrom(readOutcome({ failed: true, output: 'gh: Not Found (HTTP 404)' })).contexts, null);
    assert.deepEqual(protectionFrom(readOutcome('{"contexts":["Unit · Contract"]}')).contexts, ['Unit · Contract']);
  });
});
