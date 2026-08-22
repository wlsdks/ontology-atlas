import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **CI's network waits must have a ceiling.**
 *
 * On 2026-08-19~20 the E2E job died six times in one day. It died not in the tests
 * but in the preparation step (`playwright install-deps chromium`), and the shape was
 * this: `Ign: http://azure.archive.ubuntu.com/... InRelease` repeating for 19 minutes
 * 42 seconds until the job timeout produced `The operation was canceled.` **Not one
 * line of tests ran**, all four shards died at the same place, and one PR cost six
 * re-runs.
 *
 * apt has no ceiling on waiting, so one was imposed from outside — and that
 * imposition is **far too easy to undo**: reverting the step to its one-line
 * "original" does nothing on a normal day and only costs another 20 minutes when the
 * mirror wobbles. There is no way to notice it on that day, so it is locked here.
 *
 * **Why it is read as text.** This repository has no YAML parser dependency and will
 * not add one for a single check. Instead an assertion accompanies it that blocks
 * **going green when nothing was found** — if a step is renamed and the regex misses,
 * that assertion fails first.
 */

const ACTION = join(process.cwd(), '.github', 'actions', 'setup-playwright', 'action.yml');
const WORKFLOW = join(process.cwd(), '.github', 'workflows', 'e2e.yml');

const action = readFileSync(ACTION, 'utf8');
const workflow = readFileSync(WORKFLOW, 'utf8');

/** Flattens each `run:` block onto one line (because of YAML's folded `>-` notation). */
function runBlocks(source: string): string[] {
  const blocks: string[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s*)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, indent, inline] = match;
    const body: string[] = inline && !['|', '>-', '>', '|-'].includes(inline.trim()) ? [inline] : [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = line.length - line.trimStart().length;
      if (lineIndent <= indent.length) break;
      body.push(line.trim());
    }
    blocks.push(body.join(' '));
  }
  return blocks;
}

const blocks = runBlocks(action);
const playwrightInstalls = blocks.filter((block) => /playwright\s+install/.test(block));

describe('CI 준비 스텝은 무한정 기다리지 않는다', () => {
  it('놀고 있지 않다 — 검사할 스텝을 실제로 찾았다', () => {
    // If a step name or notation changes and the regex misses, this fails first.
    expect(blocks.length, 'setup-playwright 에서 run 블록을 하나도 못 읽었다').toBeGreaterThan(3);
    expect(
      playwrightInstalls.length,
      'playwright install 스텝을 하나도 못 찾았다 — 이 검사가 아무것도 안 보고 있다',
    ).toBeGreaterThanOrEqual(2);
  });

  it.each(playwrightInstalls)('상한과 재시도를 거쳐 돈다: %s', (block) => {
    expect(block, '`run-with-retry.mjs` 를 거치지 않는다').toContain('scripts/run-with-retry.mjs');
    expect(block, '`--timeout-ms=` 가 없다 — 상한 없는 대기가 돌아왔다').toMatch(/--timeout-ms=\d+/);
    expect(block, '`--attempts=` 가 없다').toMatch(/--attempts=\d+/);
  });

  it('apt 자신에게도 대기 상한이 있다', () => {
    expect(action).toMatch(/Acquire::http::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::https::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::Retries\s+"\d+"/);
  });

  it('준비가 최악으로 굴러도 테스트가 돌 시간이 남는다', () => {
    // Worst case = the sum of (attempts × ceiling). If that eats the job timeout the
    // ceiling was pointless — it merely moved 20 minutes to 30.
    let worstMs = 0;
    for (const block of playwrightInstalls) {
      const attempts = Number(/--attempts=(\d+)/.exec(block)?.[1] ?? 0);
      const timeoutMs = Number(/--timeout-ms=(\d+)/.exec(block)?.[1] ?? 0);
      worstMs += attempts * timeoutMs;
    }

    const jobTimeouts = [...workflow.matchAll(/^\s*timeout-minutes:\s*(\d+)\s*$/gm)].map((m) =>
      Number(m[1]),
    );
    expect(jobTimeouts.length, 'e2e.yml 에서 잡 타임아웃을 못 읽었다').toBeGreaterThanOrEqual(3);

    const tightestMs = Math.min(...jobTimeouts) * 60_000;
    // Half is the reference: even in the worst preparation, half the job remains for the tests.
    expect(worstMs, `준비 최악 ${Math.round(worstMs / 60_000)}분이 잡 예산의 절반을 넘는다`).
      toBeLessThan(tightestMs / 2);
  });
});
