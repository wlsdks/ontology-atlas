import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateNodeUid, inspectMergedUids, nodeUidIssue } from './node-uid.mjs';

const A = '01890f3e-7b5d-4c0a-8f14-123456789abc';
const B = '01890f3e-7b5d-4c0a-8f14-123456789abd';
const C = '01890f3e-7b5d-4c0a-8f14-123456789abe';

describe('node uid rule', () => {
  it('accepts only a lowercase UUIDv4, and what it mints passes', () => {
    assert.equal(nodeUidIssue(A), null);
    assert.equal(nodeUidIssue(generateNodeUid()), null);
    for (const wrong of [A.toUpperCase(), '01890f3e-7b5d-1c0a-8f14-123456789abc', '01890f3e-7b5d-4c0a-7f14-123456789abc', 'x', '', undefined, 7]) {
      assert.match(nodeUidIssue(wrong) ?? '', /lowercase UUIDv4/, String(wrong));
    }
  });

  it('keeps merged identities as an ascending set and names what breaks the rule', () => {
    assert.deepEqual(inspectMergedUids(A, undefined), { canonical: [], invalidIssue: null, nonCanonical: false });
    assert.deepEqual(inspectMergedUids(A, [B, C]), { canonical: [B, C], invalidIssue: null, nonCanonical: false });
    assert.deepEqual(inspectMergedUids(A, [C, B, B]), { canonical: [B, C], invalidIssue: null, nonCanonical: true });
    assert.match(inspectMergedUids(A, 'x').invalidIssue, /must be an array/);
    assert.match(inspectMergedUids(A, ['x']).invalidIssue, /only lowercase UUIDv4/);
    assert.match(inspectMergedUids(A, [A]).invalidIssue, /must not repeat/);
  });
});
