import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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

  // `--check` 는 여전히 날짜 스탬프를 비교에서 뺀다. 밤을 넘겨 병합된 PR 처럼
  // 기준선이 하루 낡는 경우가 남아 있는데(병합이 만드는 새 커밋의 날짜는 생성
  // 시점에 알 수 없다), 그걸로 main 을 빨갛게 만들면 게이트가 아니라 소음이
  // 된다. 결정성은 아래 "결정성 계약" 스위트가 직접 실증해 잡는다.
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
 * 결정성 계약 — "같은 소스로 두 번 생성하면 바이트 동일".
 *
 * 무엇을 잡는가: 생성물이 **생성 시점의 벽시계나 git 커밋 시각** 에 의존하면,
 * 그 값을 담은 커밋이 squash-merge / rebase / amend 로 다시 찍히는 순간 기준선이
 * 어긋난다. main 커밋 25개 실측에서 문서 1~32건이 항상 틀려 있었고, 나중에 누가
 * 재생성하면 자기가 고치지 않은 줄이 diff 로 올라와 리베이스 충돌과 유령 diff 가
 * 됐다(JSON 안에 충돌 마커가 남아 tsc 가 깨진 사고까지).
 *
 * 그래서 아래는 임시 git 저장소에서 **커밋 시각만 바꿔 다시 찍고** 산출물이
 * 바이트 단위로 같은지 확인한다 — 그 상황이 정확히 병합이 하는 일이다.
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

    // 병합이 하는 일: 같은 내용을 새 커밋으로 다시 찍는다 (시각만 달라짐).
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
    await writeFile(
      path.join(repo, 'docs', 'GUIDE.md'),
      '# Guide\n\n본문 두 줄.\n추가.\n',
      'utf8',
    );
    const { manifest } = await scan();
    assert.match(manifest.docs[0].updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(manifest.docs[0].updatedAt, localDayStamp(new Date()));
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
    // 날짜 형식이 아닌 값(구 ISO 시각 등)은 스탬프 후보에서 제외 — 벽시계
    // 정밀도가 다시 새어 들어오는 경로를 만들지 않는다.
    assert.equal(
      deterministicGeneratedAt([{ updatedAt: '2026-05-18T01:00:00.000Z' }]),
      '1970-01-01',
    );
    assert.equal(deterministicGeneratedAt([]), '1970-01-01');
  });
});
