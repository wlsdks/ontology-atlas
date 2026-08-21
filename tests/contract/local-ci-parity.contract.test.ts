import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **훅이 CI 를 대신 보려면 같은 방식으로 재야 한다.**
 *
 * ## 왜 (2026-08-21 실측)
 *
 * `pre-push` 훅은 `checks:changed` 가 지목한 검사를 그대로 돌린다. 그런데 e2e
 * 에서 CI 와 방식이 갈렸다: CI 는 `pnpm build && PLAYWRIGHT_STATIC=1` 로 **빌드된
 * 정적 export** 를 상대로 돌고(`e2e.yml`), 훅은 아무 표시 없이 돌아 `next dev`
 * 를 새로 띄웠다.
 *
 * Next dev 는 라우트를 **첫 요청 때 컴파일**한다. 그래서 웹 스모크 하나가
 * 10분을 넘겨도 안 끝났다 — 사람이라면 그 시점에 훅을 꺼 버린다. 그리고 끄는
 * 순간 이 훅은 없는 것과 같아진다.
 *
 * 라우트 하나를 여는 실측: **dev 56.5초 vs 정적 6.5초**(#1178).
 *
 * 그래서 **둘이 같은 표시를 쓰는지**를 여기서 잠근다. 값이 바뀌어도 좋고,
 * 한쪽만 바뀔 때만 터진다.
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** 실행되는 줄만 남긴다 — 주석에 적힌 같은 문자열에 속지 않는다. */
const executable = (source: string) =>
  source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('로컬 훅과 CI 가 같은 방식으로 e2e 를 돈다', () => {
  const workflow = read('.github/workflows/e2e.yml');
  const hook = executable(read('.githooks/pre-push'));

  it('CI 가 정적 export 를 상대로 돈다', () => {
    expect(workflow).toContain('PLAYWRIGHT_STATIC=1');
    expect(workflow).toContain('pnpm build');
  });

  it('훅도 같은 표시를 쓴다 — 안 쓰면 dev 를 띄워 10분을 넘긴다', () => {
    expect(hook, 'pre-push 가 PLAYWRIGHT_STATIC 을 안 켠다').toContain('PLAYWRIGHT_STATIC');
    expect(hook, 'pre-push 가 빌드 없이 정적 서버를 띄우려 한다').toContain('pnpm build');
  });

  it('훅은 e2e 가 있을 때만 빌드한다 — 없는 비용을 늘 치르지 않는다', () => {
    // 조건 없이 빌드하면 문서 한 줄 고친 푸시도 1분 넘게 기다린다.
    expect(hook).toMatch(/grep -q "playwright test"/);
  });

  it('삭제 경로가 정렬의 마지막이어도 set -e 로 조용히 끝나지 않는다', () => {
    /*
     * `[ -e "$f" ] && printf …` 는 마지막 경로가 삭제 파일이면 상태 1을 남긴다.
     * 훅의 `set -e` 가 그 상태를 받아 실제 검사 전에 종료한 회귀를 막는다.
     */
    expect(hook).not.toMatch(/\[ -e "\$f" \] && printf/);
    expect(hook).toMatch(/if \[ -e "\$f" \]; then[\s\S]*printf[\s\S]*fi/);
  });

  it('검사기가 헛돌지 않는다 — 두 파일을 실제로 읽어 왔다', () => {
    expect(workflow.length).toBeGreaterThan(1000);
    expect(hook).toContain('suggest-focused-checks');
  });
});
