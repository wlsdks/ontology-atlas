import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **If a hook stands in for CI it has to measure the same way.**
 *
 * ## Why (measured 2026-08-21)
 *
 * The `pre-push` hook runs exactly the checks `checks:changed` names. But for e2e
 * its method diverged from CI's: CI runs against the **built static export** via
 * `pnpm build && PLAYWRIGHT_STATIC=1` (`e2e.yml`), while the hook ran with no flag
 * and started a fresh `next dev`.
 *
 * Next dev compiles a route **on its first request**, so one web smoke run had not
 * finished after 10 minutes — at which point a person switches the hook off. And
 * the moment it is switched off, this hook may as well not exist.
 *
 * Measured for opening a single route: **dev 56.5s vs static 6.5s** (#1178).
 *
 * So what is locked here is that **both use the same flag**. Changing the value is
 * fine; this only breaks when one side changes alone.
 */

const repoRoot = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');

/** Keeps only executed lines — so the same string written in a comment cannot fool it. */
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
    // Building unconditionally makes even a one-line docs push wait over a minute.
    expect(hook).toMatch(/grep -q "playwright test"/);
  });

  it('삭제 경로가 정렬의 마지막이어도 set -e 로 조용히 끝나지 않는다', () => {
    /*
     * `[ -e "$f" ] && printf …` leaves status 1 when the last path is a deleted file.
     * This blocks the regression where the hook's `set -e` picked up that status and
     * exited before running any actual check.
     */
    expect(hook).not.toMatch(/\[ -e "\$f" \] && printf/);
    expect(hook).toMatch(/if \[ -e "\$f" \]; then[\s\S]*printf[\s\S]*fi/);
  });

  it('검사기가 헛돌지 않는다 — 두 파일을 실제로 읽어 왔다', () => {
    expect(workflow.length).toBeGreaterThan(1000);
    expect(hook).toContain('suggest-focused-checks');
  });
});
