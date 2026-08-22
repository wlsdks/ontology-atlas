import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  comparableDoc,
  comparableManifest,
  deterministicGeneratedAt,
  extractOutLinksWithContext,
  localDayStamp,
  parseArgs,
  resolveWikilinkTargetSlug,
  scanVaultDir,
  usage,
} from './build-docs-vault.mjs';

describe('build-docs-vault script helpers', () => {
  it('parses check/help flags and rejects accidental writes from unknown args', () => {
    assert.deepEqual(parseArgs([]), { check: false });
    assert.deepEqual(parseArgs(['--check']), { check: true });
    assert.deepEqual(parseArgs(['--help']), { help: true });
    assert.deepEqual(parseArgs(['-h']), { help: true });
    assert.deepEqual(parseArgs(['--check', 'extra']), {
      error: 'Unexpected argument: extra',
    });
    assert.deepEqual(parseArgs(['--fix']), {
      error: 'Unknown option: --fix',
    });
  });

  it('keeps usage explicit about check mode being read-only', () => {
    assert.match(usage(), /Usage: node scripts\/build-docs-vault\.mjs \[--check\]/);
    assert.match(usage(), /Verify generated outputs are current without writing/);
  });

  // `--check` still excludes the date stamp from the comparison. A baseline can be a
  // day stale — a PR merged across midnight, where the date of the new commit the
  // merge creates is unknowable at generation time — and turning main red for that is
  // noise rather than a gate. Determinism is proven directly by the "determinism
  // contract" suite below.
  it('ignores timestamp-only manifest churn while preserving content drift', () => {
    const baseDoc = {
      slug: 'README',
      title: 'Readme',
      wordCount: 10,
      updatedAt: '2026-05-18',
    };
    const nextDoc = {
      ...baseDoc,
      updatedAt: '2026-05-19',
    };
    assert.deepEqual(comparableDoc(baseDoc), comparableDoc(nextDoc));
    assert.notDeepEqual(
      comparableDoc(baseDoc),
      comparableDoc({ ...nextDoc, wordCount: 11 }),
    );

    const baseManifest = {
      version: '2026-04-23',
      generatedAt: '2026-05-18',
      docs: [baseDoc],
    };
    const nextManifest = {
      ...baseManifest,
      generatedAt: '2026-05-19',
      docs: [nextDoc],
    };
    assert.deepEqual(comparableManifest(baseManifest), comparableManifest(nextManifest));
    assert.notDeepEqual(
      comparableManifest(baseManifest),
      comparableManifest({
        ...nextManifest,
        docs: [{ ...nextDoc, title: 'Changed' }],
      }),
    );
  });
});

describe('resolveWikilinkTargetSlug / extractOutLinksWithContext — nested ontology/ vault', () => {
  // persona QA (fix/persona-findings ③) — mirror of the shared TS test in
  // src/shared/lib/parse-frontmatter.test.ts. This .mjs copy is the one that
  // actually builds the static dogfood manifest (`docs-vault:build`), so it
  // needs its own regression guard against the same drift.
  it('ontology/ 문서 안의 위키링크는 ontology/ 접두사를 붙여 정규화한다', () => {
    assert.equal(
      resolveWikilinkTargetSlug('capabilities/topology-canvas-render', 'ontology/elements/sigma-graphology'),
      'ontology/capabilities/topology-canvas-render',
    );
    const { contexts } = extractOutLinksWithContext(
      '같은 캔버스 엔진 얘기는 [[capabilities/topology-canvas-render]] 참고.',
      'ontology/elements/sigma-graphology',
    );
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].target, 'ontology/capabilities/topology-canvas-render');
  });

  it('이미 ontology/ 접두사가 붙은 위키링크는 이중으로 접두사를 붙이지 않는다', () => {
    assert.equal(
      resolveWikilinkTargetSlug('ontology/project', 'ontology/domains/views'),
      'ontology/project',
    );
  });

  it('ontology/ 바깥(최상위) 문서의 위키링크는 그대로 vault 루트 기준을 유지한다', () => {
    assert.equal(resolveWikilinkTargetSlug('FEATURES', 'CHANGELOG'), 'FEATURES');
  });
});

/**
 * Determinism contract — "generating twice from the same source yields identical
 * bytes".
 *
 * What it catches: if generated output depends on **the wall clock or the git commit
 * time at generation**, the baseline diverges the moment the commit carrying that
 * value is restamped by squash-merge, rebase, or amend. Measured across 25 commits on
 * main, 1–32 documents were always wrong, and a later regeneration put lines nobody
 * had touched into the diff, producing rebase conflicts and phantom diffs (including
 * an incident where a conflict marker left inside JSON broke tsc).
 *
 * So the tests below restamp **only the commit time** in a temporary git repository
 * and check the output is byte-identical — which is exactly what a merge does.
 */
describe('build-docs-vault 결정성 계약', () => {
  let repo = null;

  const git = (args, env = {}) =>
    execFileSync('git', args, {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    });

  const scan = async () =>
    scanVaultDir(path.join(repo, 'docs'), {
      rootDir: repo,
      check: true,
      publicOutDir: null,
    });

  before(async () => {
    repo = await mkdtemp(path.join(os.tmpdir(), 'docs-vault-determinism-'));
    git(['init', '-q', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Determinism Probe']);
    git(['config', 'commit.gpgsign', 'false']);
    await mkdir(path.join(repo, 'docs'), { recursive: true });
    await writeFile(
      path.join(repo, 'docs', 'GUIDE.md'),
      '# Guide\n\n본문 한 줄.\n',
      'utf8',
    );
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'docs: add guide'], {
      GIT_AUTHOR_DATE: '2026-03-04T01:02:03+09:00',
      GIT_COMMITTER_DATE: '2026-03-04T01:02:03+09:00',
    });
  });

  after(async () => {
    if (repo) await rm(repo, { recursive: true, force: true });
  });

  it('두 번 연속 생성하면 바이트 동일하다', async () => {
    const first = await scan();
    const second = await scan();
    assert.equal(
      JSON.stringify(first.manifest),
      JSON.stringify(second.manifest),
    );
    assert.equal(JSON.stringify(first.content), JSON.stringify(second.content));
  });

  it('같은 날 안에서 커밋 시각이 다시 찍혀도(squash-merge·rebase) 바이트 동일하다', async () => {
    const before = await scan();
    assert.equal(before.manifest.docs[0].updatedAt, '2026-03-04');

    // What a merge does: restamps the same content as a new commit, changing only the time.
    git(['commit', '-q', '--amend', '--no-edit'], {
      GIT_AUTHOR_DATE: '2026-03-04T23:58:59+09:00',
      GIT_COMMITTER_DATE: '2026-03-04T23:58:59+09:00',
    });

    const after = await scan();
    assert.equal(
      JSON.stringify(before.manifest),
      JSON.stringify(after.manifest),
      '커밋 시각 재기록만으로 생성물이 흔들리면 리베이스 충돌 회귀다',
    );
  });

  it('날짜가 실제로 바뀌면 값도 따라 바뀐다 (정확성은 희생하지 않는다)', async () => {
    git(['commit', '-q', '--amend', '--no-edit'], {
      GIT_AUTHOR_DATE: '2026-03-06T10:00:00+09:00',
      GIT_COMMITTER_DATE: '2026-03-06T10:00:00+09:00',
    });
    const { manifest } = await scan();
    assert.equal(manifest.docs[0].updatedAt, '2026-03-06');
    assert.equal(manifest.generatedAt, '2026-03-06');
  });

  it('워킹트리에서 고치는 중인 문서는 mtime **날짜** 로 기록한다 (시각 아님)', async () => {
    const edited = path.join(repo, 'docs', 'GUIDE.md');
    await writeFile(edited, '# Guide\n\n본문 두 줄.\n추가.\n', 'utf8');
    /*
     * ⚠️ The expected value is derived from **that file's mtime**. It used to call
     * `localDayStamp(new Date())` after the scan, which lets "when the file was written"
     * and "when the expectation was built" fall on different days — writing just before
     * midnight and measuring just after breaks by a day for reasons unrelated to the
     * product. Using the same source the scan reads (mtime) removes the window entirely
     * (full check audit, 2026-08-17).
     */
    const { mtime } = await stat(edited);
    const { manifest } = await scan();
    assert.match(manifest.docs[0].updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(manifest.docs[0].updatedAt, localDayStamp(mtime));
  });

  it('localDayStamp 는 로컬 날짜만 남기고 시각을 버린다', () => {
    const morning = new Date(2026, 2, 4, 1, 2, 3);
    const night = new Date(2026, 2, 4, 23, 58, 59);
    assert.equal(localDayStamp(morning), '2026-03-04');
    assert.equal(localDayStamp(night), '2026-03-04');
    assert.equal(localDayStamp(new Date(2026, 2, 5, 0, 0, 1)), '2026-03-05');
    assert.equal(localDayStamp('not a date'), null);
  });

  it('generatedAt 은 문서 날짜의 최대값이고 벽시계가 아니다', () => {
    assert.equal(
      deterministicGeneratedAt([
        { updatedAt: '2026-03-04' },
        { updatedAt: '2026-07-27' },
        { updatedAt: '2026-01-09' },
      ]),
      '2026-07-27',
    );
    // Values that are not date-shaped (an old ISO timestamp, say) are excluded as stamp
    // candidates, so wall-clock precision has no path back in.
    assert.equal(
      deterministicGeneratedAt([{ updatedAt: '2026-05-18T01:00:00.000Z' }]),
      '1970-01-01',
    );
    assert.equal(deterministicGeneratedAt([]), '1970-01-01');
  });
});
