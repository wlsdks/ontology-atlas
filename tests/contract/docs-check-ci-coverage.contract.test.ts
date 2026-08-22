import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Locks that **every sub-check of `docs:check` is actually invoked in CI**.
 *
 * **Why this contract exists** (code review, 2026-08-07). `docs:check` was wired into
 * CI on 2026-08-06, but its `docs:surface:check` **launches a real MCP server** and so
 * runs only in a job that has `mcp/node_modules`. One step was therefore split across
 * two jobs — the two that only read files go in `gates`, and the one that launches a
 * server goes in
 * `mcp`.
 *
 * That split was **tied to `package.json`'s definition by nothing at all.** Adding a
 * fourth sub-check to `docs:check` means it **runs nowhere in CI**, with no signal.
 * The very reason this step exists — "a check that is never invoked does not exist" —
 * had simply moved up one level.
 *
 * So the list is **extracted from the definition** rather than kept in sync by
 * hand.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/checks.yml';

/** Extracts the sub-script names `docs:check` actually invokes from its definition. */
function docsCheckSubScripts(): string[] {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const def = pkg.scripts['docs:check'];
  expect(def, 'package.json 에 docs:check 가 없다 — 이 계약의 전제가 사라졌다').toBeTruthy();
  return [...def.matchAll(/pnpm\s+([a-z0-9:-]+)/g)].map((m) => m[1]);
}

describe('docs:check — 하위 검사가 전부 CI 에서 불린다', () => {
  it('정의에서 하위 검사를 실제로 뽑아낸다 (공회전 차단)', () => {
    // Extracting 0 and passing with "everything is covered" is this contract's only failure mode.
    expect(docsCheckSubScripts().length).toBeGreaterThan(1);
  });

  it.each(docsCheckSubScripts())('%s 를 부르는 CI 스텝이 있다', (script) => {
    const workflow = read(WORKFLOW);
    /**
     * Searches `run:` lines for the script **as a whole word**, so `docs:links` cannot
     * falsely pass by matching `docs:links:external`.
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
