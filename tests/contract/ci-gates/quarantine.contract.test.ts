import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MERGE_SMOKE_SPECS } from '../../../scripts/ci/merge-smoke-specs.mjs';
import { runQuarantine } from '../../../scripts/ci/quarantine.mjs';
import {
  PROVE_REQUIRED,
  QUARANTINE_MAX_DAYS,
  QUARANTINE_MAX_ENTRIES,
  QUARANTINE_REGISTRY,
  quarantineViolations,
} from '../../../scripts/lib/ci/quarantine.mjs';

/**
 * A quarantined test blocks neither a merge nor the release gate, so the registry stays small,
 * short-lived and accountable: at most ten whole files, fourteen days each, never a merge-smoke or
 * contract file, each with an owner, a reason, a red-then-green run and an issue. No rule here reads
 * today's date; expiry is the nightly browser run's (`quarantine.mjs check-expiry`).
 */

const ROOT = process.cwd();
const registry = JSON.parse(readFileSync(join(ROOT, QUARANTINE_REGISTRY), 'utf8'));

const REAL_SPEC = 'tests/e2e/library/library-check-background.spec.ts';
const entry = (overrides: Record<string, string> = {}) => ({
  file: REAL_SPEC,
  owner: 'octocat',
  reason: 'The band check reads a layout that settles after the first frame on a loaded runner.',
  evidence: 'https://github.com/example/atlas/actions/runs/123/attempts/1',
  issue: 'https://github.com/example/atlas/issues/7',
  added: '2026-11-22',
  expires: '2026-12-06',
  ...overrides,
});
const violations = (entries: unknown[]) => quarantineViolations({ entries }, { root: ROOT });

describe('the quarantine registry', () => {
  it('breaks none of its rules', () => {
    expect(quarantineViolations(registry, { root: ROOT })).toEqual([]);
  });

  it('accepts a sound entry, so the refusals below are each about their one planted fault', () => {
    expect(violations([entry()])).toEqual([]);
    expect(violations([entry({ file: 'app/[locale]/project/fallback/ProjectFallbackClient.test.tsx' })])).toEqual([]);
  });

  it('refuses a merge-smoke spec, a contract file, a surface-lane spec and a node:test file', () => {
    expect(MERGE_SMOKE_SPECS.length).toBeGreaterThan(0);
    expect(violations([entry({ file: `tests/e2e/${MERGE_SMOKE_SPECS[0]}` })]).join()).toMatch(/merge-smoke/);
    expect(violations([entry({ file: 'tests/contract/ci-gates/quarantine.contract.test.ts' })]).join()).toMatch(/contract file/);
    expect(violations([entry({ file: 'tests/e2e/web-surface-smoke.spec.ts' })]).join()).toMatch(/surface-lane/);
    expect(violations([entry({ file: 'scripts/ci/run-ci-lane.test.mjs' })]).join()).toMatch(/node:test/);
  });

  it('refuses a file that does not exist', () => {
    expect(violations([entry({ file: 'tests/e2e/library/no-such-file.spec.ts' })]).join()).toMatch(/does not exist/);
  });

  it(`refuses a window longer than ${QUARANTINE_MAX_DAYS} days, an empty one and a day that is not on the calendar`, () => {
    expect(violations([entry({ expires: '2026-12-07' })]).join()).toMatch(/15 days after added/);
    expect(violations([entry({ expires: '2026-11-22' })]).join()).toMatch(/after added/);
    expect(violations([entry({ added: '2026-02-30' })]).join()).toMatch(/calendar day/);
  });

  it(`refuses an entry past the ${QUARANTINE_MAX_ENTRIES}th and the same file twice`, () => {
    const specs = readFileSync(join(ROOT, 'tests/e2e/post-merge-specs.ts'), 'utf8').match(/[\w/-]+\.spec\.ts/g) ?? [];
    const files = [...new Set(specs)].map((spec) => `tests/e2e/${spec}`).slice(0, QUARANTINE_MAX_ENTRIES + 1);
    expect(files, 'enough real specs to fill the registry').toHaveLength(QUARANTINE_MAX_ENTRIES + 1);
    expect(violations(files.slice(0, QUARANTINE_MAX_ENTRIES).map((file) => entry({ file })))).toEqual([]);
    expect(violations(files.map((file) => entry({ file }))).join()).toMatch(/11 entries; the most is 10/);
    expect(violations([entry(), entry()]).join()).toMatch(/listed twice/);
  });

  it('refuses an entry without an owner, a reason, a run URL or an issue URL, and any extra key', () => {
    expect(violations([entry({ owner: '' })]).join()).toMatch(/owner is required/);
    expect(violations([entry({ reason: ' ' })]).join()).toMatch(/reason is required/);
    expect(violations([entry({ evidence: 'passed on rerun' })]).join()).toMatch(/Actions run URL/);
    expect(violations([entry({ issue: 'https://github.com/example/atlas/pull/7' })]).join()).toMatch(/issue URL/);
    expect(violations([{ ...entry(), project: 'web' }]).join()).toMatch(/unknown key project/);
    expect(quarantineViolations({ entries: [], extra: true }, { root: ROOT })).toHaveLength(1);
  });
});

describe('the quarantine commands', () => {
  const quiet = () => {
    const lines: string[] = [];
    return { lines, log: (line: string) => lines.push(line) };
  };

  it('check-expiry fails on an entry past its last day and passes on that day', () => {
    const planted = { entries: [entry()] };
    const late = quiet();
    expect(runQuarantine(['check-expiry', '--today=2026-12-07'], { registry: planted, log: late.log, env: {} })).toBe(1);
    expect(late.lines.join('\n')).toMatch(/expired: tests\/e2e\/library\/library-check-background\.spec\.ts \(owner octocat\)/);
    expect(runQuarantine(['check-expiry', '--today=2026-12-06'], { registry: planted, log: quiet().log, env: {} })).toBe(0);
    expect(runQuarantine(['check-expiry', '--today=2099-01-01'], { registry: { entries: [] }, log: quiet().log, env: {} })).toBe(0);
  });

  it(`prove stops at the first failing repeat and counts the passes before it, out of ${PROVE_REQUIRED}`, () => {
    let runs = 0;
    const spawn = () => ({ status: ++runs === 7 ? 1 : 0, stdout: '', stderr: 'planted failure' });
    const out = quiet();
    const file = 'src/shared/lib/cn.test.ts';
    expect(runQuarantine(['prove', file], { spawn, log: out.log, env: {} })).toBe(1);
    expect(out.lines.at(-1)).toBe(`[quarantine] prove ${file}: 6 of 65 passed; stopped at the first failure`);
    expect(runs).toBe(7);
    runs = -1_000;
    const green = quiet();
    expect(runQuarantine(['prove', file], { spawn, log: green.log, env: {} })).toBe(0);
    expect(green.lines.at(-1)).toBe(`[quarantine] prove ${file}: 65 of 65 passed`);
  });
});
