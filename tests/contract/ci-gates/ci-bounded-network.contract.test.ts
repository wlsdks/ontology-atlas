import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * CI network waits need a ceiling: apt has none, and reverting the step is silent until a mirror
 * stalls. Read as text (no YAML parser dependency); an assertion fails if nothing is found.
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
const PLAYWRIGHT_JOB_IDS = ['surfaces', 'suite', 'quarantined', 'vite-app'];

function jobBlock(source: string, id: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((line) => line === `  ${id}:`);
  if (start < 0) return '';
  const next = lines.findIndex((line, index) => index > start && /^  [a-z0-9-]+:\s*$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

describe('CI setup steps do not wait without bound', () => {
  it('does not idle — it really found steps to check', () => {
    // If a step name or notation changes and the regex misses, this fails first.
    expect(blocks.length, 'could not read a single run block in setup-playwright').toBeGreaterThan(3);
    expect(
      playwrightInstalls.length,
      'could not find a single playwright install step — this check is looking at nothing',
    ).toBeGreaterThanOrEqual(2);
  });

  it.each(playwrightInstalls)('runs through a bound and a retry: %s', (block) => {
    expect(block, 'does not go through `run-with-retry.mjs`').toContain('scripts/ci/run-with-retry.mjs');
    expect(block, '`--timeout-ms=` is missing — the unbounded wait is back').toMatch(/--timeout-ms=\d+/);
    expect(block, '`--attempts=` is missing').toMatch(/--attempts=\d+/);
  });

  it('apt itself also has a wait bound', () => {
    expect(action).toMatch(/Acquire::http::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::https::Timeout\s+"\d+"/);
    expect(action).toMatch(/Acquire::Retries\s+"\d+"/);
  });

  it('runs apt only on Linux and caches the browser where this system keeps it', () => {
    // The suite runs on macOS, which has no apt; an unguarded step would fail every browser job.
    const aptSteps = action.split(/\n(?= {4}- name: )/).filter((step) => /- name: (?:Bound apt|Install Playwright system deps)/.test(step));
    expect(aptSteps.length, 'could not find the apt steps').toBe(2);
    for (const step of aptSteps) expect(step).toContain("if: runner.os == 'Linux'");
    expect(action).toContain("path: ${{ runner.os == 'macOS' && '~/Library/Caches/ms-playwright' || '~/.cache/ms-playwright' }}");
  });

  it('even if setup goes worst-case, time is left for the tests to run', () => {
    // Worst case = the sum of (attempts × ceiling). If that eats the job timeout the
    // ceiling was pointless — it merely moved 20 minutes to 30.
    let worstMs = 0;
    for (const block of playwrightInstalls) {
      const attempts = Number(/--attempts=(\d+)/.exec(block)?.[1] ?? 0);
      const timeoutMs = Number(/--timeout-ms=(\d+)/.exec(block)?.[1] ?? 0);
      worstMs += attempts * timeoutMs;
    }

    const jobTimeouts = PLAYWRIGHT_JOB_IDS.map((id) => {
      const job = jobBlock(workflow, id);
      expect(job, `could not read the ${id} Playwright job`).not.toBe('');
      expect(job, `${id} no longer calls setup-playwright`).toContain(
        './.github/actions/setup-playwright',
      );
      return Number(/^\s*timeout-minutes:\s*(\d+)\s*$/m.exec(job)?.[1] ?? 0);
    });
    expect(jobTimeouts.length, 'the Playwright job inventory is empty').toBeGreaterThanOrEqual(3);
    expect(Math.min(...jobTimeouts), 'could not read the Playwright job timeout').toBeGreaterThan(0);

    const tightestMs = Math.min(...jobTimeouts) * 60_000;
    // Half is the reference: even in the worst preparation, half the job remains for the tests.
    expect(worstMs, `worst-case setup ${Math.round(worstMs / 60_000)} minutes exceeds half the job budget`).
      toBeLessThan(tightestMs / 2);
  });
});
