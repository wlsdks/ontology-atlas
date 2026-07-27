import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 생성 매니페스트 결정성 가드 — 커밋되는 생성물 안에 **생성 시점** 이 새어
 * 들어오지 못하게 한다.
 *
 * 실측 결함(2026-07-27): `manifest.json` 의 `generatedAt` 과 문서별
 * `updatedAt` 이 git 커밋 **시각** 정밀도(`%cI`)로 기록되고, 커밋 시각을 못
 * 찾으면 파일시스템 mtime(벽시계)으로 폴백했다. 그런데 이 값들은 자신을
 * 담은 커밋을 묘사하는데, 그 커밋의 시각은 생성 시점에 알 수 없다 —
 * GitHub squash-merge 는 PR 브랜치 커밋을 버리고 새 커밋에 새 시각을 찍고,
 * rebase·amend 도 같은 일을 한다. 그래서 main 에 들어간 기준선은 **태어날
 * 때부터** 문서 1~32건이 틀려 있었고(최근 커밋 25개 중 24개), 나중에 누가
 * 재생성하면 자기가 고치지도 않은 줄이 diff 로 올라왔다. 결과는 매 PR 리베이스
 * 충돌 + 리뷰 불가능한 유령 diff + JSON 에 남은 충돌 마커로 인한 tsc 파손.
 *
 * 처방은 **날짜 정밀도** 다: 병합이 시각을 다시 찍어도 같은 날이면 값이
 * 그대로고, 같은 날 갈라진 두 브랜치는 같은 문자열을 써서 git 이 자동
 * 병합한다. 소비처는 전부 일 단위 이상이라(“N일 전” 사다리 · 최근 7일 렌즈 ·
 * 주별 히트맵 · 정렬) 정확성 손실이 없다.
 *
 * 이 가드는 그 규격을 코드로 강제한다 — 문서에만 있는 규격은 지켜지지 않는다.
 * 파생 로직 자체의 결정성(같은 소스 → 같은 바이트, 커밋 시각 재기록 내성)은
 * `scripts/build-docs-vault.test.mjs` 의 "결정성 계약" 스위트가 임시 git
 * 저장소로 실증한다.
 */

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DATA_DIR = path.join(
  process.cwd(),
  'src',
  'entities',
  'docs-vault',
  'data',
);

const MANIFESTS = [
  'manifest.json',
  'sample-storefront.manifest.json',
] as const;

interface GeneratedManifest {
  generatedAt: string;
  docs: ReadonlyArray<{ slug: string; updatedAt: string }>;
}

function readManifest(name: string): GeneratedManifest {
  return JSON.parse(
    readFileSync(path.join(DATA_DIR, name), 'utf8'),
  ) as GeneratedManifest;
}

describe.each(MANIFESTS)('%s — 커밋된 생성물에 벽시계가 없다', (name) => {
  const manifest = readManifest(name);

  it('문서가 실제로 들어 있다 (파서가 죽으면 이 가드가 먼저 터진다)', () => {
    expect(manifest.docs.length).toBeGreaterThan(10);
  });

  it('generatedAt 은 날짜(YYYY-MM-DD)뿐이다', () => {
    expect(manifest.generatedAt).toMatch(DAY_ONLY);
  });

  it('모든 문서의 updatedAt 이 날짜(YYYY-MM-DD)뿐이다', () => {
    const withTime = manifest.docs
      .filter((doc) => !DAY_ONLY.test(doc.updatedAt))
      .map((doc) => `${doc.slug}=${doc.updatedAt}`);
    expect(withTime).toEqual([]);
  });

  it('generatedAt 은 문서 날짜의 최대값이다 (빌드 시각이 아니다)', () => {
    const newest = manifest.docs
      .map((doc) => doc.updatedAt)
      .reduce((a, b) => (a >= b ? a : b));
    expect(manifest.generatedAt).toBe(newest);
  });
});

describe('build-docs-vault.mjs — 생성기가 벽시계를 읽지 않는다', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'scripts', 'build-docs-vault.mjs'),
    'utf8',
  );

  it('현재 시각을 읽는 호출이 없다', () => {
    // 생성기가 "지금" 을 읽는 순간 산출물은 실행 시점에 의존하고, 커밋되는
    // 기준선은 재생성마다 흔들린다.
    const wallClockCalls = ['Date.now(', 'new Date()', 'toISOString('].filter(
      (needle) => source.includes(needle),
    );
    expect(wallClockCalls).toEqual([]);
  });

  it('git 날짜를 시각 정밀도로 읽지 않는다', () => {
    // `%cI`/`%aI` 는 시각까지 준다 — squash-merge 가 다시 찍는 바로 그 부분.
    // 날짜만 주는 `%cs` 를 쓴다.
    expect(source).not.toMatch(/%[ca]I/);
    expect(source).toContain('%cs');
  });

  it('직전 생성물을 입력으로 되먹이지 않는다', () => {
    // 생성물이 자기 직전 생성물에 의존하면 "같은 입력 → 같은 바이트" 가
    // 성립하지 않는다 (기준선이 유실되면 값이 갈린다).
    expect(source).not.toContain('previousManifest');
  });
});

/**
 * 매니페스트를 만들거나 검증하는 워크플로는 **전체 히스토리**로 체크아웃해야
 * 한다. GitHub 기본값은 depth 1 이고, 그러면 유일한 커밋이 부모 없는 root 로
 * 취급돼 `git log --name-only` 가 전체 트리를 그 한 커밋에 귀속시킨다 — 실측
 * 결과 문서 247 경로가 **서로 다른 날짜 1개**를 공유했다. 그 상태로 배포되면
 * 사이트의 모든 문서가 "오늘 바뀐" 것으로 보인다.
 */
describe('워크플로 — 매니페스트를 만지는 잡은 전체 히스토리를 받는다', () => {
  const WORKFLOW_DIR = path.join(process.cwd(), '.github', 'workflows');

  /** 생성기를 직접(또는 `pnpm build` 를 통해) 실행하는 워크플로. */
  const MANIFEST_WORKFLOWS = [
    'checks.yml',
    'deploy-pages.yml',
    'release-macos.yml',
  ] as const;

  /** `jobs:` 아래 2-space 잡 헤더 기준으로 잡 본문을 쪼갠다. */
  function splitJobs(yaml: string): Array<{ name: string; body: string }> {
    const jobsAt = yaml.indexOf('\njobs:\n');
    const region = jobsAt === -1 ? yaml : yaml.slice(jobsAt);
    const headers = [...region.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)];
    return headers.map((match, index) => ({
      name: match[1],
      body: region.slice(
        match.index ?? 0,
        index + 1 < headers.length ? headers[index + 1].index : undefined,
      ),
    }));
  }

  /** 생성기를 직접(또는 `pnpm build` 를 통해) 실행하는 스텝이 있는가. */
  const RUNS_GENERATOR = /docs-vault:(build|check)|pnpm build\b/;

  it.each(MANIFEST_WORKFLOWS)('%s', (name) => {
    const yaml = readFileSync(path.join(WORKFLOW_DIR, name), 'utf8');
    const jobs = splitJobs(yaml);
    expect(jobs.length).toBeGreaterThan(0);

    const generatorJobs = jobs.filter((job) => RUNS_GENERATOR.test(job.body));
    // 이 워크플로가 목록에 있는 이유 자체가 생성기를 돌리기 때문이다 — 하나도
    // 없으면 목록이 낡았다는 뜻이라 먼저 터져야 한다.
    expect(generatorJobs.map((job) => job.name).length).toBeGreaterThan(0);

    for (const job of generatorJobs) {
      expect(job.body, `${name} · ${job.name} 잡의 checkout`).toMatch(
        /uses: actions\/checkout@[^\n]*\n\s+with:\n\s+fetch-depth: 0/,
      );
    }
  });
});
