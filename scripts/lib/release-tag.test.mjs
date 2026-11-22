import assert from 'node:assert/strict';
import test from 'node:test';

import { isReleaseTag, parseReleaseTag } from './release-tag.mjs';

test('reads a plain tag as the stable channel', () => {
  assert.deepEqual(parseReleaseTag('v2.5.0'), {
    tag: 'v2.5.0',
    version: '2.5.0',
    channel: 'stable',
    beta: null,
    stableTag: 'v2.5.0',
  });
});

test('reads a beta tag as the beta channel with the plain version the app carries', () => {
  assert.deepEqual(parseReleaseTag('v2.5.0-beta.12'), {
    tag: 'v2.5.0-beta.12',
    version: '2.5.0',
    channel: 'beta',
    beta: 12,
    stableTag: 'v2.5.0',
  });
});

test('refuses every other shape', () => {
  for (const tag of [
    '',
    '2.5.0',
    'v2.5',
    'v02.5.0',
    'v2.5.0-rc.1',
    'v2.5.0-beta.0',
    'v2.5.0-beta.01',
    'v2.5.0-beta.1.2',
    'v2.5.0-beta',
    'v2.5.0-Beta.1',
    'v2.5.0+build.1',
    'v2.5.0-beta.1+build',
    'v2.5.0 ',
  ]) {
    assert.throws(() => parseReleaseTag(tag), /release tag/, `accepted ${JSON.stringify(tag)}`);
    assert.equal(isReleaseTag(tag), false, `isReleaseTag accepted ${JSON.stringify(tag)}`);
  }
  assert.throws(() => parseReleaseTag(undefined), /release tag is empty/);
});

test('names both accepted shapes when it refuses', () => {
  assert.throws(() => parseReleaseTag('v2.5.0-rc.1'), /vMAJOR\.MINOR\.PATCH or vMAJOR\.MINOR\.PATCH-beta\.N/);
});
