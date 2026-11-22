import assert from 'node:assert/strict';
import test from 'node:test';

import { isReleaseTag, parseReleaseTag, splitUpdaterManifestVersion, updaterManifestVersion } from './release-tag.mjs';

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

const COMMIT = '0123456789abcdef0123456789abcdef01234567';

test('a stable latest.json version names the release commit in build metadata', () => {
  assert.equal(updaterManifestVersion('2.5.0', COMMIT), '2.5.0+0123456789ab');
  for (const commit of [undefined, '', '0123456789ab', COMMIT.toUpperCase()]) {
    assert.throws(() => updaterManifestVersion('2.5.0', commit), /not a full lowercase 40-hex commit/, String(commit));
  }
  assert.throws(() => updaterManifestVersion('2.5.0+0123456789ab', COMMIT), /already carries build metadata/);
});

test('reading a latest.json version gives the plain version a person sees and the commit apart', () => {
  assert.deepEqual(splitUpdaterManifestVersion('2.5.0+0123456789ab'), { version: '2.5.0', commit: '0123456789ab' });
  assert.deepEqual(splitUpdaterManifestVersion('2.4.0'), { version: '2.4.0', commit: null });
  for (const value of ['2.5.0+build.7', '2.5.0-beta.1', '2.5.0+0123456789abc', 'v2.5.0', null]) {
    assert.throws(() => splitUpdaterManifestVersion(value), /neither X\.Y\.Z nor/, String(value));
  }
});
