import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `docs:check` 의 **하위 검사 전부가 CI 에서 실제로 불리는지** 잠근다.
 *
 * ## 왜 이 계약이 생겼나 (2026-08-07 코드 리뷰)
 *
 * 2026-08-06 에 `docs:check` 를 CI 에 물렸는데, 그 안의 `docs:surface:check` 는
 * **실제 MCP 서버를 띄우므로** `mcp/node_modules` 가 있는 잡에서만 돈다. 그래서
 * 한 스텝을 두 잡으로 갈랐다 — 파일만 읽는 둘은 `gates`, 서버를 띄우는 하나는
 * `mcp`.
 *
 * 그 분할이 **`package.json` 의 정의와 아무것으로도 묶여 있지 않았다.**
 * `docs:check` 에 네 번째 하위 검사를 더하면 **CI 어디에서도 안 돈다** — 그리고
 * 아무 신호가 없다. 이 스텝을 만든 이유였던 «검사가 있어도 부르지 않으면 없는
 * 것이다» 가 한 층 위로 옮겨 간 것뿐이다.
 *
 * 그래서 목록을 손으로 맞추지 않고 **정의에서 뽑아** 대조한다.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/checks.yml';

/** `docs:check` 가 실제로 부르는 하위 스크립트 이름을 정의에서 뽑는다. */
function docsCheckSubScripts(): string[] {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const def = pkg.scripts['docs:check'];
  expect(def, 'package.json 에 docs:check 가 없다 — 이 계약의 전제가 사라졌다').toBeTruthy();
  return [...def.matchAll(/pnpm\s+([a-z0-9:-]+)/g)].map((m) => m[1]);
}

describe('docs:check — 하위 검사가 전부 CI 에서 불린다', () => {
  it('정의에서 하위 검사를 실제로 뽑아낸다 (공회전 차단)', () => {
    // 0개를 뽑고 «전부 덮였다» 고 통과하는 것이 이 계약의 유일한 실패 모드다.
    expect(docsCheckSubScripts().length).toBeGreaterThan(1);
  });

  it.each(docsCheckSubScripts())('%s 를 부르는 CI 스텝이 있다', (script) => {
    const workflow = read(WORKFLOW);
    /**
     * `run:` 줄에서 그 스크립트를 **단어 단위**로 찾는다. `docs:links` 가
     * `docs:links:external` 에 걸려 거짓 통과하는 것을 막는다.
     */
    const called = new RegExp(`run:\\s*pnpm\\s+${script.replace(/[:]/g, '\\:')}(?![a-z0-9:-])`, 'm');
    expect(
      called.test(workflow),
      `${script} 가 ${WORKFLOW} 의 어떤 스텝에서도 안 불린다 — ` +
        `docs:check 에 하위 검사를 더했으면 CI 스텝도 같이 만든다. ` +
        `(스텝을 나눈 이유는 그 파일 주석에: 서버를 띄우는 검사는 mcp 잡에서만 돈다)`,
    ).toBe(true);
  });

  it('워크플로를 실제로 읽고 있다 (파일이 사라지면 터진다)', () => {
    expect(read(WORKFLOW)).toContain('name: Checks');
  });
});
