import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';

import {
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_ALLOWED_EDGES,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../../tests/fixtures/architecture-profile-cases.mjs';
import {
  buildArchitectureBrief,
  buildArchitectureMeasuredStamp,
  parseArchitectureProfile,
} from './architecture-profile.mjs';
import {
  assertArchitectureRecord,
  buildArchitectureRecord,
  writeArchitectureRecord,
} from './architecture-record.mjs';
import { inspectProjectSource } from './project-source-inspection.mjs';
import { SidecarPathError } from './vault-sidecar.mjs';

const SHORT_SHA_RE = /\b[0-9a-f]{7,12}\b/;
const CONTENT_HASH = `sha256:${'ab'.repeat(32)}`;

function git(root, args) {
  execFileSync('git', ['-C', root, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    },
  });
}

function makeStampedBrief(measured) {
  const profile = parseArchitectureProfile(HEXAGONAL_PROFILE_FRONTMATTER);
  return buildArchitectureBrief(
    profile,
    {
      rootPath: '/machine/path/repo',
      edges: HEXAGONAL_ALLOWED_EDGES.map((edge) => ({ ...edge, importUsage: 'value' })),
      filesScanned: 8,
      coverage: { allDetectedLanguagesSupported: true, supportedLanguages: ['typescript'] },
    },
    { measured },
  );
}

function folderStamp() {
  return buildArchitectureMeasuredStamp(
    { kind: 'folder', fingerprint: `sha256:${'0f'.repeat(32)}`, dirty: null },
    { at: '2026-08-27T00:00:00.000Z', toolName: 'ontology-atlas', toolVersion: '0.0.0-test' },
  );
}

function hasKeyDeep(value, key) {
  if (Array.isArray(value)) return value.some((item) => hasKeyDeep(item, key));
  if (value && typeof value === 'object') {
    return Object.keys(value).some(
      (candidate) => candidate === key || hasKeyDeep(value[candidate], key),
    );
  }
  return false;
}

test('git measured stamp carries a short sha and a true dirty flag for a dirty tree', () => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-record-git-')));
  try {
    git(repo, ['init', '--quiet']);
    writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n', 'utf-8');
    git(repo, ['add', 'a.ts']);
    git(repo, ['commit', '--quiet', '-m', 'init']);

    const clean = buildArchitectureMeasuredStamp(inspectProjectSource(repo), {
      at: '2026-08-27T00:00:00.000Z',
      toolName: 'ontology-atlas',
      toolVersion: '0.0.0-test',
    });
    assert.equal(clean.source.kind, 'git');
    assert.match(clean.source.revision, /^[0-9a-f]{12}$/);
    assert.equal(clean.source.dirty, false);
    assert.equal('fingerprint' in clean.source, false);
    assert.deepEqual(clean.tool, { name: 'ontology-atlas', version: '0.0.0-test' });

    // The dirty-tree stamp: an uncommitted edit must be visible in the receipt.
    writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n', 'utf-8');
    const dirty = buildArchitectureMeasuredStamp(inspectProjectSource(repo), {
      toolName: 'ontology-atlas',
      toolVersion: '0.0.0-test',
    });
    assert.equal(dirty.source.dirty, true);
    assert.equal(dirty.source.revision, clean.source.revision);
    assert.ok(!Number.isNaN(Date.parse(dirty.at)));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('folder measured stamp carries a fingerprint and never anything sha-shaped', () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-record-folder-')));
  try {
    writeFileSync(join(folder, 'a.ts'), 'export const a = 1;\n', 'utf-8');
    const stamp = buildArchitectureMeasuredStamp(inspectProjectSource(folder), {
      at: '2026-08-27T00:00:00.000Z',
      toolName: 'ontology-atlas',
      toolVersion: '0.0.0-test',
    });
    assert.equal(stamp.source.kind, 'folder');
    assert.match(stamp.source.fingerprint, /^sha256:[0-9a-f]{64}$/);
    assert.equal('revision' in stamp.source, false);
    assert.equal('dirty' in stamp.source, false);
    // A folder stamp must not smuggle in a commit-sha lookalike anywhere.
    assert.doesNotMatch(JSON.stringify(stamp), SHORT_SHA_RE);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('measured stamp refuses a conflated or unknown source inspection', () => {
  const base = { toolName: 'ontology-atlas', toolVersion: '0.0.0-test' };
  assert.throws(() => buildArchitectureMeasuredStamp({ kind: 'zip' }, base), /git or folder/);
  assert.throws(
    () => buildArchitectureMeasuredStamp({ kind: 'git', revision: 'abc', dirty: false }, base),
    /full git commit sha/,
  );
  assert.throws(
    () => buildArchitectureMeasuredStamp({ kind: 'folder', fingerprint: 'a'.repeat(64) }, base),
    /sha256: folder fingerprint/,
  );
});

test('the record wraps the stamped brief with every rootPath stripped recursively', () => {
  const brief = makeStampedBrief(folderStamp());
  assert.equal(brief.conformance.source.rootPath, '/machine/path/repo');

  const record = buildArchitectureRecord(brief, {
    profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
    profileSlug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
    profileContentHash: CONTENT_HASH,
  });
  assert.equal(record.contract, 'architectureRecord:v1');
  assert.deepEqual(record.profile, {
    uid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
    slug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
    contentHash: CONTENT_HASH,
  });
  assert.equal(record.brief.contract, 'architectureBrief:v1');
  assert.equal(record.brief.measured.source.kind, 'folder');
  assert.equal(hasKeyDeep(record, 'rootPath'), false);
  // The original brief is not mutated by the strip.
  assert.equal(brief.conformance.source.rootPath, '/machine/path/repo');
  assert.doesNotThrow(() => assertArchitectureRecord(record));
});

test('record and profile parsers reject each other in both directions', () => {
  const record = buildArchitectureRecord(makeStampedBrief(folderStamp()), {
    profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
    profileSlug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
    profileContentHash: CONTENT_HASH,
  });
  // A profile can never validate as a record.
  assert.throws(() => assertArchitectureRecord(FSD_PROFILE_FRONTMATTER), /looks like an architecture profile/);
  assert.throws(() => assertArchitectureRecord(HEXAGONAL_PROFILE_FRONTMATTER), /looks like an architecture profile/);
  assert.throws(() => assertArchitectureRecord({ profile_uid: 'x', contract: 'architectureRecord:v1' }));
  assert.throws(() => assertArchitectureRecord({ role_core: ['src/**'], contract: 'architectureRecord:v1' }));
  // And a record can never parse as a profile.
  assert.throws(() => parseArchitectureProfile(record), /architecture_schema/);
});

test('the validator refuses conflated stamps and unstamped briefs', () => {
  const valid = buildArchitectureRecord(makeStampedBrief(folderStamp()), {
    profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
    profileSlug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
    profileContentHash: CONTENT_HASH,
  });

  const unstamped = structuredClone(valid);
  delete unstamped.brief.measured;
  assert.throws(() => assertArchitectureRecord(unstamped), /measured/);

  const gitWithFingerprint = structuredClone(valid);
  gitWithFingerprint.brief.measured.source = {
    kind: 'git',
    revision: 'abcdef123456',
    dirty: false,
    fingerprint: `sha256:${'0f'.repeat(32)}`,
  };
  assert.throws(() => assertArchitectureRecord(gitWithFingerprint), /must not carry a folder fingerprint/);

  const folderWithSha = structuredClone(valid);
  folderWithSha.brief.measured.source = {
    kind: 'folder',
    fingerprint: `sha256:${'0f'.repeat(32)}`,
    revision: 'abcdef123456',
  };
  assert.throws(() => assertArchitectureRecord(folderWithSha), /must not carry a git revision/);

  const leaked = structuredClone(valid);
  leaked.brief.conformance.source.rootPath = '/machine/path/repo';
  assert.throws(() => assertArchitectureRecord(leaked), /rootPath/);
});

test('writeArchitectureRecord lands atomically in the sidecar and leaves one activity line', () => {
  const vault = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-record-vault-')));
  try {
    const record = buildArchitectureRecord(makeStampedBrief(folderStamp()), {
      profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
      profileSlug: HEXAGONAL_PROFILE_FRONTMATTER.profile_slug,
      profileContentHash: CONTENT_HASH,
    });
    const written = writeArchitectureRecord(vault, record);
    assert.equal(written.path, '.ontology-atlas/architecture/payments-core.json');

    const storedPath = join(vault, '.ontology-atlas', 'architecture', 'payments-core.json');
    const stored = JSON.parse(readFileSync(storedPath, 'utf-8'));
    assert.deepEqual(stored, record);

    // Overwritten per slug: a second write replaces, never accumulates.
    writeArchitectureRecord(vault, record);
    assert.deepEqual(JSON.parse(readFileSync(storedPath, 'utf-8')), record);

    const activity = readFileSync(join(vault, '.ontology-atlas', 'activity.jsonl'), 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    assert.equal(activity.length, 2);
    assert.equal(activity[0].tool, 'architecture_record');
    assert.equal(activity[0].target, '.ontology-atlas/architecture/payments-core.json');
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});

test('writeArchitectureRecord fails closed on a path-shaped profile slug', () => {
  const vault = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-record-slug-')));
  try {
    const record = buildArchitectureRecord(makeStampedBrief(folderStamp()), {
      profileUid: HEXAGONAL_PROFILE_FRONTMATTER.profile_uid,
      profileSlug: '../escape',
      profileContentHash: CONTENT_HASH,
    });
    assert.throws(
      () => writeArchitectureRecord(vault, record),
      (error) => error instanceof SidecarPathError,
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
  }
});
