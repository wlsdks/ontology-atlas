import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('scripts/generate-download-release-facts.mjs');
const WINDOWS_NAME = 'ontology-atlas_1.2.3_windows_x64-setup.exe';
const DMG_NAME = 'ontology-atlas_1.2.3_aarch64.dmg';

function fakeReleaseRoot(
  windowsChecksumFilename,
  {
    dmgName = DMG_NAME,
    dmgDownloadUrl = 'https://example.invalid/dmg',
    releaseUrl = 'https://example.invalid/release',
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-release-facts-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(root, 'src/views/download/model'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.2.3' }));

  const release = {
    draft: false,
    prerelease: false,
    published_at: '2026-08-17T00:00:00Z',
    html_url: releaseUrl,
    assets: [
      { id: 1, name: dmgName, size: 10, browser_download_url: dmgDownloadUrl },
      { id: 101, name: `${dmgName}.sha256`, size: 100, browser_download_url: 'https://example.invalid/dmg.sha256' },
      { id: 2, name: WINDOWS_NAME, size: 20, browser_download_url: 'https://example.invalid/exe' },
      { id: 102, name: `${WINDOWS_NAME}.sha256`, size: 100, browser_download_url: 'https://example.invalid/exe.sha256' },
    ],
  };
  const fakeGh = `#!/usr/bin/env node
const request = process.argv.slice(2).join(' ');
if (request.includes('select(.draft')) {
  // The newest published release, which is what --check compares against.
  process.stdout.write('v1.2.3\\n');
} else if (request.includes('/releases/tags/')) {
  process.stdout.write(${JSON.stringify(JSON.stringify(release))});
} else if (request.includes('/assets/101')) {
  process.stdout.write(${'`'}${'a'.repeat(64)}  ${dmgName}\\n${'`'});
} else if (request.includes('/assets/102')) {
  process.stdout.write(${'`'}${'b'.repeat(64)}  ${windowsChecksumFilename}\\n${'`'});
} else {
  process.stderr.write('unexpected fake gh request: ' + request);
  process.exit(2);
}
`;
  const ghPath = path.join(bin, 'gh');
  fs.writeFileSync(ghPath, fakeGh, { mode: 0o755 });
  return { root, bin };
}

function runGenerator(root, bin, args = ['--tag=v1.2.3']) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` },
    encoding: 'utf8',
  });
}

const GENERATED = 'src/views/download/model/macos-release.generated.ts';

test('rejects a Windows checksum that names a different installer', () => {
  const { root, bin } = fakeReleaseRoot('unrelated.exe');
  try {
    const result = runGenerator(root, bin);

    assert.notEqual(result.status, 0, 'generator accepted a checksum for unrelated.exe');
    assert.match(result.stderr, /checksum file names unrelated\.exe/);
    assert.match(result.stderr, new RegExp(`expected ${WINDOWS_NAME.replaceAll('.', '\\.')}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts matching checksum filenames and writes the published facts', () => {
  const { root, bin } = fakeReleaseRoot(WINDOWS_NAME);
  try {
    const result = runGenerator(root, bin);
    assert.equal(result.status, 0, result.stderr);

    const generated = fs.readFileSync(
      path.join(root, 'src/views/download/model/macos-release.generated.ts'),
      'utf8',
    );
    assert.match(generated, new RegExp(WINDOWS_NAME.replaceAll('.', '\\.')));
    assert.ok(generated.includes(`sha256: ${JSON.stringify('b'.repeat(64))}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects a macOS asset name whose version field contains executable source', () => {
  const maliciousName = "ontology-atlas_1.2.3'; throw new Error('PWN'); //_aarch64.dmg";
  const { root, bin } = fakeReleaseRoot(WINDOWS_NAME, { dmgName: maliciousName });
  try {
    const result = runGenerator(root, bin);

    assert.notEqual(result.status, 0, 'generator accepted an executable asset-name payload');
    assert.match(result.stderr, /mismatched macOS asset version/);
    assert.equal(
      fs.existsSync(path.join(root, 'src/views/download/model/macos-release.generated.ts')),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('serializes release URLs as inert TypeScript string literals', () => {
  const hostileUrl = "https://example.invalid/'; throw new Error('PWN'); //";
  const { root, bin } = fakeReleaseRoot(WINDOWS_NAME, {
    dmgDownloadUrl: hostileUrl,
    releaseUrl: hostileUrl,
  });
  try {
    const result = runGenerator(root, bin);
    assert.equal(result.status, 0, result.stderr);

    const generated = fs.readFileSync(
      path.join(root, 'src/views/download/model/macos-release.generated.ts'),
      'utf8',
    );
    assert.ok(generated.includes(`downloadUrl: ${JSON.stringify(hostileUrl)}`));
    assert.ok(generated.includes(`releaseUrl: ${JSON.stringify(hostileUrl)}`));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/*
 * ⚠️ `--check` is the half that noticed nothing for two releases.
 *
 * The write half works and always did; what failed was the handoff after it, because the release
 * token cannot push to protected main and nobody compared the committed file with the release it
 * claims to describe. These two cases pin both directions of that comparison, so the gate cannot
 * quietly become a no-op — the failure mode it exists to prevent.
 */
test('--check passes when the committed facts match the newest published release', () => {
  const { root, bin } = fakeReleaseRoot(WINDOWS_NAME);
  try {
    assert.equal(runGenerator(root, bin).status, 0, 'could not write the facts to compare against');

    // No --tag: the check has to find the newest published release by itself.
    const result = runGenerator(root, bin, ['--check']);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /matches the published v1\.2\.3/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('--check fails, names both tags, and writes nothing when the committed facts are stale', () => {
  const { root, bin } = fakeReleaseRoot(WINDOWS_NAME);
  try {
    assert.equal(runGenerator(root, bin).status, 0, 'could not write the facts to compare against');
    const generatedPath = path.join(root, GENERATED);
    const current = fs.readFileSync(generatedPath, 'utf8');
    // The exact drift the owner found: an older release still named on the page.
    const stale = current.replace(/tag: "v1\.2\.3"/g, 'tag: "v1.2.2"');
    assert.notEqual(stale, current, 'the fixture no longer contains a tag to age');
    fs.writeFileSync(generatedPath, stale);

    const result = runGenerator(root, bin, ['--check']);

    assert.notEqual(result.status, 0, 'the check accepted facts for a release nobody published');
    assert.match(result.stderr, /committed: v1\.2\.2/);
    assert.match(result.stderr, /published: v1\.2\.3/);
    assert.match(result.stderr, /pnpm download:release-facts -- --tag=v1\.2\.3/);
    assert.equal(fs.readFileSync(generatedPath, 'utf8'), stale, '--check wrote to the file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
