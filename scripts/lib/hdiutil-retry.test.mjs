import assert from 'node:assert/strict';
import test from 'node:test';

import { isTransientHdiutilFailure, stalePathForVolume } from './hdiutil-retry.mjs';

/*
 * ⚠️ The probe that matters is the negative one. A retry helper that returns true too
 * often is worse than no retry: it turns one honest error into three identical ones
 * and reports the last. So the real failures below must stay false.
 */
test('retries the failure that actually killed the rc.15 x64 release', () => {
  assert.equal(
    isTransientHdiutilFailure({ stderr: 'hdiutil: create failed - Resource busy' }),
    true,
  );
});

test('reads either stream, and ignores case', () => {
  assert.equal(isTransientHdiutilFailure({ stdout: 'RESOURCE BUSY' }), true);
  assert.equal(
    isTransientHdiutilFailure({ stderr: 'hdiutil: attach failed - resource temporarily unavailable' }),
    true,
  );
  assert.equal(isTransientHdiutilFailure({ stderr: 'Device busy' }), true);
});

test('does not retry a failure that will never succeed', () => {
  for (const stderr of [
    'hdiutil: create failed - No space left on device',
    'hdiutil: create failed - Operation not permitted',
    'ditto: cannot copy: No such file or directory',
    'hdiutil: create failed - Invalid argument',
    'error: The specified item could not be found in the keychain.',
  ]) {
    assert.equal(isTransientHdiutilFailure({ stderr }), false, stderr);
  }
});

test('empty output is not a reason to try again', () => {
  assert.equal(isTransientHdiutilFailure({}), false);
  assert.equal(isTransientHdiutilFailure({ stdout: '', stderr: '   ' }), false);
});

test('names the stale mount a retry should clear first', () => {
  assert.equal(stalePathForVolume('Ontology Atlas'), '/Volumes/Ontology Atlas');
});
