import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  pickPublishedRelease,
  stageHostedUpdaterManifest,
  validateHostedUpdaterManifest,
} from './stage-hosted-updater-manifest.mjs';

const tag = 'v1.3.0';
const manifest = {
  version: '1.3.0',
  notes: 'release',
  pub_date: '2026-08-22T00:00:00.000Z',
  platforms: {
    'darwin-aarch64': {
      signature: 'signed',
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/${tag}/ontology-atlas_1.3.0_aarch64.app.tar.gz`,
    },
  },
};

test('selects the newest published plain release, skipping drafts and pre-releases', () => {
  const selected = pickPublishedRelease([
    { tag_name: 'v2-draft', draft: true },
    { tag_name: 'v1.4.0', draft: false, prerelease: true, published_at: '2026-08-23T00:00:00Z' },
    { tag_name: 'v1.2.5', draft: false, prerelease: false, published_at: '2026-08-21T00:00:00Z' },
    { tag_name: tag, draft: false, prerelease: false, published_at: '2026-08-22T00:00:00Z' },
  ]);
  assert.equal(selected.tag_name, tag);
});

test('refuses a requested tag that GitHub marks as a pre-release', () => {
  assert.throws(
    () => pickPublishedRelease([{ tag_name: 'v1.4.0', draft: false, prerelease: true }], 'v1.4.0'),
    /no published plain release matches v1\.4\.0/,
  );
});

test('stages and validates the release latest.json at the stable Pages path', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-hosted-updater-'));
  const out = path.join(scratch, 'update', 'latest.json');
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/releases?')) {
      return new Response(
        JSON.stringify([
          {
            tag_name: tag,
            draft: false,
            prerelease: false,
            assets: [{ name: 'latest.json', browser_download_url: 'https://assets.test/latest.json' }],
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(manifest), { status: 200 });
  };
  try {
    const report = await stageHostedUpdaterManifest({
      repo: 'wlsdks/ontology-atlas',
      apiBase: 'https://api.test',
      out,
      fetchImpl,
    });
    assert.equal(report.tag, tag);
    assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), manifest);
    assert.equal(calls.length, 2);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('refuses a platform key beyond the Apple Silicon one', () => {
  assert.throws(
    () =>
      validateHostedUpdaterManifest(
        {
          ...manifest,
          platforms: {
            ...manifest.platforms,
            'darwin-aarch64-app': manifest.platforms['darwin-aarch64'],
          },
        },
        tag,
      ),
    /darwin-aarch64-app is not one of darwin-aarch64, darwin-x86_64/,
  );
});

test('refuses the right path on a foreign host', () => {
  assert.throws(
    () =>
      validateHostedUpdaterManifest(
        {
          ...manifest,
          platforms: {
            'darwin-aarch64': {
              signature: 'signed',
              url: `https://github.example/wlsdks/ontology-atlas/releases/download/${tag}/ontology-atlas_1.3.0_aarch64.app.tar.gz`,
            },
          },
        },
        tag,
      ),
    /not pinned to v1\.3\.0 as https:\/\/github\.com\//,
  );
});

const twoKeyManifest = (version) => ({
  version,
  notes: '',
  pub_date: '2026-10-03T00:00:00Z',
  platforms: Object.fromEntries(
    [
      ['darwin-aarch64', 'aarch64'],
      ['darwin-x86_64', 'x64'],
    ].map(([platform, arch]) => [
      platform,
      {
        signature: 'signed',
        url: `https://github.com/wlsdks/ontology-atlas/releases/download/v${version}/ontology-atlas_${version}_${arch}.app.tar.gz`,
      },
    ]),
  ),
});

test("accepts v1.5.0's two-key manifest, the last with an Intel entry", () => {
  assert.equal(validateHostedUpdaterManifest(twoKeyManifest('1.5.0'), 'v1.5.0').version, '1.5.0');
});

test('refuses an Intel entry after v1.5.0', () => {
  assert.throws(
    () => validateHostedUpdaterManifest(twoKeyManifest('1.6.0'), 'v1.6.0'),
    /darwin-x86_64 is not one of darwin-aarch64 for v1\.6\.0/,
  );
});

test('rejects a manifest whose version or asset URLs belong to another release', () => {
  assert.throws(
    () => validateHostedUpdaterManifest({ ...manifest, version: '1.2.5' }, tag),
    /does not match/,
  );
  assert.throws(
    () =>
      validateHostedUpdaterManifest(
        {
          ...manifest,
          platforms: {
            'darwin-aarch64': {
              signature: 'signed',
              url: 'https://github.com/wlsdks/ontology-atlas/releases/download/v1.2.5/app.tar.gz',
            },
          },
        },
        tag,
      ),
    /not pinned/,
  );
});

test('fails closed when the selected release has no updater manifest', async () => {
  await assert.rejects(
    stageHostedUpdaterManifest({
      out: '/tmp/never-written-atlas-latest.json',
      fetchImpl: async () =>
        new Response(JSON.stringify([{ tag_name: tag, draft: false, prerelease: false, assets: [] }]), {
          status: 200,
        }),
    }),
    /has no latest\.json asset/,
  );
});
