#!/usr/bin/env node
/**
 * `pnpm e2e:sleeps:check` — a change may not add a fixed sleep to an e2e spec.
 *
 * `.claude/rules/testing.md` already forbids waiting by the clock, and nothing
 * enforced it: 126 `waitForTimeout` calls sat in 68 specs on 2026-09-26. One of
 * them read the map tour's card mid-reframe on a slow CI runner and ejected a
 * train (lesson cb5fbfaf); a red train costs a bisect, which is the landing
 * train's throughput limit. Fixing all of them is a separate job; this stops
 * new ones.
 *
 * It judges only the lines this change adds against its merge base, so it keeps
 * no shared baseline number for twenty parallel branches to collide on. A sleep
 * that really is a measurement window says so on its line or the line above:
 * `// measurement window: <why>`.
 */

import { spawnSync } from 'node:child_process';

const SLEEP = /\bwaitForTimeout\(/;
const JUSTIFIED = /measurement window/i;

/** Added lines of a `git diff -U0` that add a sleep without a measurement-window note. */
export function unjustifiedSleeps(diff) {
  const findings = [];
  let file = null;
  let line = 0;
  let previousAdded = '';
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw.startsWith('+++ b/') ? raw.slice('+++ b/'.length) : null;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]);
      previousAdded = '';
      continue;
    }
    if (!file || !raw.startsWith('+')) continue;
    const text = raw.slice(1);
    if (SLEEP.test(text) && !JUSTIFIED.test(text) && !JUSTIFIED.test(previousAdded)) {
      findings.push({ file, line, text: text.trim() });
    }
    previousAdded = text;
    line += 1;
  }
  return findings;
}

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

function main(argv) {
  const baseArg = argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length);
  const candidates = [baseArg, process.env.DECISION_BASE_REF, 'origin/main', 'main'].filter(Boolean);
  const base = candidates.map((ref) => git(['merge-base', 'HEAD', ref])?.trim()).find(Boolean);
  if (!base) {
    console.log('[e2e-sleeps] no comparable base ref; skipping (nothing to diff against)');
    return 0;
  }
  // Working tree against the merge base: committed and uncommitted additions alike.
  const diff = git(['diff', '-U0', '--no-color', base, '--', 'tests/e2e']);
  if (diff === null) {
    console.error('[e2e-sleeps] git diff failed');
    return 1;
  }
  const findings = unjustifiedSleeps(diff);
  if (findings.length === 0) {
    console.log('[e2e-sleeps] no new fixed sleep in tests/e2e ✓');
    return 0;
  }
  console.error(`[e2e-sleeps] ${findings.length} new fixed sleep(s) in tests/e2e:`);
  for (const { file, line, text } of findings) console.error(`  ${file}:${line}  ${text}`);
  console.error(
    '\nWait for the state the screen shows instead (tests/e2e/settle.ts: waitForAnimationsDone, waitForBoxStill, '
      + 'waitForMapStill, waitFrames). A sleep that is a real measurement window says '
      + '`// measurement window: <why>` on its line or the line above.',
  );
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2).filter((arg) => arg !== '--'));
}
