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

const tag = 'v1.0.0-rc.9';
const manifest = {
  version: '1.0.0-rc.9',
  notes: 'release',
  pub_date: '2026-08-22T00:00:00.000Z',
  platforms: {
    'darwin-aarch64': {
      signature: 'signed',
      url: `https://github.com/wlsdks/ontology-atlas/releases/download/${tag}/app.tar.gz`,
    },
  },
};

test('selects the newest non-draft release even when it is a prerelease', () => {
  const selected = pickPublishedRelease([
    { tag_name: 'v2-draft', draft: true },
    {
      tag_name: 'v1.0.0-rc.8',
      draft: false,
      prerelease: true,
      published_at: '2026-08-21T00:00:00Z',
    },
    {
      tag_name: tag,
      draft: false,
      prerelease: true,
      published_at: '2026-08-22T00:00:00Z',
    },
  ]);
  assert.equal(selected.tag_name, tag);
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
            prerelease: true,
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

test('rejects a manifest whose version or asset URLs belong to another release', () => {
  assert.throws(
    () => validateHostedUpdaterManifest({ ...manifest, version: '1.0.0-rc.8' }, tag),
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
              url: 'https://github.com/wlsdks/ontology-atlas/releases/download/v1.0.0-rc.8/app.tar.gz',
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
        new Response(JSON.stringify([{ tag_name: tag, draft: false, prerelease: true, assets: [] }]), {
          status: 200,
        }),
    }),
    /has no latest\.json asset/,
  );
});
