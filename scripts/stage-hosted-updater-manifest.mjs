#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REPO = 'wlsdks/ontology-atlas';
const DEFAULT_API_BASE = 'https://api.github.com';

function fail(message) {
  throw new Error(`[hosted-updater] ${message}`);
}

export function pickPublishedRelease(releases, requestedTag = null) {
  if (!Array.isArray(releases) || releases.length === 0) {
    fail('GitHub returned no releases.');
  }
  const published = releases.filter((entry) => entry?.draft !== true);
  const release = requestedTag
    ? published.find((entry) => entry?.tag_name === requestedTag)
    : published.reduce((newest, entry) => {
        if (!newest) return entry;
        const newestAt = Date.parse(newest.published_at ?? newest.created_at ?? '');
        const entryAt = Date.parse(entry.published_at ?? entry.created_at ?? '');
        if (!Number.isFinite(entryAt)) return newest;
        if (!Number.isFinite(newestAt) || entryAt > newestAt) return entry;
        return newest;
      }, null);
  if (!release) {
    fail(
      requestedTag
        ? `no published release matches ${requestedTag}`
        : 'no non-draft release is available',
    );
  }
  return release;
}

export function validateHostedUpdaterManifest(value, releaseTag) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('latest.json must be an object');
  }
  const version = value.version;
  const expectedVersion = releaseTag.replace(/^v/, '');
  if (typeof version !== 'string' || version !== expectedVersion) {
    fail(`latest.json version ${String(version)} does not match ${releaseTag}`);
  }
  const platforms = value.platforms;
  if (!platforms || typeof platforms !== 'object' || Array.isArray(platforms)) {
    fail('latest.json has no platforms object');
  }
  const entries = Object.entries(platforms);
  if (entries.length === 0) fail('latest.json has zero platform entries');
  for (const [platform, entry] of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${platform} updater entry is not an object`);
    }
    if (typeof entry.signature !== 'string' || entry.signature.trim() === '') {
      fail(`${platform} updater entry has no signature`);
    }
    if (typeof entry.url !== 'string') fail(`${platform} updater entry has no URL`);
    let url;
    try {
      url = new URL(entry.url);
    } catch {
      fail(`${platform} updater URL is invalid`);
    }
    if (url.protocol !== 'https:') fail(`${platform} updater URL must use https`);
    if (!url.pathname.includes(`/releases/download/${releaseTag}/`)) {
      fail(`${platform} updater URL is not pinned to ${releaseTag}`);
    }
  }
  return value;
}

function headers(token, accept = 'application/vnd.github+json') {
  return {
    Accept: accept,
    'User-Agent': 'ontology-atlas-hosted-updater',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function readJson(response, label) {
  if (!response.ok) fail(`${label} returned HTTP ${response.status}`);
  try {
    return await response.json();
  } catch (error) {
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function stageHostedUpdaterManifest({
  repo = DEFAULT_REPO,
  requestedTag = null,
  apiBase = DEFAULT_API_BASE,
  out,
  token = null,
  fetchImpl = fetch,
}) {
  if (!out) fail('an output path is required');
  const releasesUrl = `${apiBase.replace(/\/$/, '')}/repos/${repo}/releases?per_page=20`;
  const releases = await readJson(
    await fetchImpl(releasesUrl, { headers: headers(token) }),
    'GitHub releases',
  );
  const release = pickPublishedRelease(releases, requestedTag);
  const asset = Array.isArray(release.assets)
    ? release.assets.find((entry) => entry?.name === 'latest.json')
    : null;
  if (!asset?.browser_download_url) {
    fail(`release ${release.tag_name} has no latest.json asset`);
  }
  const manifest = await readJson(
    await fetchImpl(asset.browser_download_url, {
      headers: headers(token, 'application/octet-stream'),
    }),
    `${release.tag_name} latest.json`,
  );
  validateHostedUpdaterManifest(manifest, release.tag_name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { tag: release.tag_name, version: manifest.version, out };
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    requestedTag: process.env.PUBLISHED_RELEASE_TAG?.trim() || null,
    apiBase: DEFAULT_API_BASE,
    out: 'out/update/latest.json',
    token: process.env.GITHUB_TOKEN?.trim() || null,
  };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--repo=')) options.repo = arg.slice('--repo='.length);
    else if (arg.startsWith('--tag=')) options.requestedTag = arg.slice('--tag='.length) || null;
    else if (arg.startsWith('--api-base=')) options.apiBase = arg.slice('--api-base='.length);
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
    else fail(`unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const report = await stageHostedUpdaterManifest(parseArgs(process.argv.slice(2)));
  console.log(`[hosted-updater] ${report.tag} (${report.version}) -> ${report.out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
