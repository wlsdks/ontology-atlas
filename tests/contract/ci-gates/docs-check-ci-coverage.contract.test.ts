import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every sub-check of `docs:check` must be invoked in CI. `docs:surface:check` launches a real MCP
 * server and runs only in a job with `mcp/node_modules`, so the list is extracted from the
 * `package.json` definition rather than kept in sync by hand.
 */

const ROOT = process.cwd();
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

const WORKFLOW = '.github/workflows/checks.yml';
const CI_REGISTRY = 'scripts/ci/classify-change.mjs';

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
    const registry = read(CI_REGISTRY);
    /**
     * Searches `run:` lines for the script **as a whole word**, so `docs:links` cannot
     * falsely pass by matching `docs:links:external`.
     */
    const called = new RegExp(`['\"]pnpm\\s+${script.replace(/[:]/g, '\\:')}(?![a-z0-9:-])`, 'm');
    expect(
      called.test(registry),
      `${script} is missing from the exhaustive lane of ${CI_REGISTRY}. ` +
        `A sub-check added to docs:check needs its CI step too. ` +
        `(The workflow runs this registry; checks that start a server belong in the mcp lane.)`,
    ).toBe(true);
    expect(workflow).toContain('node scripts/ci/run-ci-lane.mjs');
  });
});
