import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The browser suite runs after merge on macOS: nightly, on a release tag and on a dispatched
 * branch, never on a pull request. Its jobs install pnpm, Chromium and the app only when the
 * checkout-only impact planner assigns them evidence, and a missing plan turns each red. Read as
 * text: this repository has no YAML parser in its dependency tree.
 */

const ROOT = process.cwd();
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');
const setupAction = readFileSync(
  join(ROOT, '.github', 'actions', 'setup-playwright', 'action.yml'),
  'utf8',
);

const BROWSER_JOB_IDS = ['surfaces', 'suite'] as const;

function jobBlock(id: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${id}:`);
  if (start < 0) return '';
  const next = lines.findIndex((line, index) => index > start && /^  [a-z0-9-]+:\s*$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

function stepBlock(job: string, name: string): string {
  const lines = job.split('\n');
  const start = lines.findIndex((line) => line === `      - name: ${name}`);
  if (start < 0) return '';
  const next = lines.findIndex(
    (line, index) => index > start && /^      - (?:name:|uses:)/.test(line),
  );
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}

/** The keys directly under `on:`. */
function triggers(): string[] {
  const block = /^on:\n((?: {2}.*\n|\s*\n)+)/m.exec(workflow)?.[1] ?? '';
  return [...block.matchAll(/^ {2}([a-z_]+):/gm)].map((match) => match[1]);
}

describe('merging never waits for the browser suite', () => {
  it('runs on the schedule and on dispatch only', () => {
    expect(triggers()).toEqual(['schedule', 'workflow_dispatch']);
  });

  it('titles a whole run with a value GitHub can parse', () => {
    // An unquoted YAML value may not hold ': ' or ' #'; GitHub then rejects the whole file and
    // every run of it, nightly and release gate alike, fails before a job starts.
    const value = /^run-name: (.+)$/m.exec(workflow)?.[1] ?? '';
    expect(value, 'e2e.yml lost its run-name').toContain('whole run');
    if (!/^["']/.test(value)) expect(value).not.toMatch(/: | #/);
  });

  it('never cancels a run, so a release-gate run on a tag finishes', () => {
    expect(workflow).toMatch(/^ {2}cancel-in-progress: false$/m);
    expect(workflow).toMatch(/^ {2}group: .*inputs\.plan_from/m);
  });

  it('runs every browser job on macOS and keeps the plan and the build on Linux', () => {
    expect(jobBlock('suite'), 'the three shards disappeared').toContain('shard: [1, 2, 3]');
    for (const id of [...BROWSER_JOB_IDS, 'quarantined']) {
      expect(jobBlock(id), `${id} job is missing`).toMatch(/^ {4}runs-on: macos-15$/m);
    }
    for (const id of ['changes', 'build', 'quarantine-expiry']) {
      expect(jobBlock(id), `${id} job is missing`).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    }
  });
});

describe('E2E impact planning precedes expensive setup', () => {
  it('one checkout-only job publishes the encoded plan and three browser decisions', () => {
    const changes = jobBlock('changes');
    expect(changes, 'changes job is missing').not.toBe('');
    for (const output of ['plan', 'playwright', 'static', 'web']) {
      expect(changes, `${output} output is missing`).toContain(
        `      ${output}: ` + '${{ steps.impact.outputs.' + output + ' }}',
      );
    }
    const planner = stepBlock(changes, 'Build impact plan');
    expect(planner).toContain('node scripts/ci/classify-change.mjs');
    expect(planner).toContain('EVENT_NAME: ${{ github.event_name }}');
    // A planned dispatch names a commit; anything else would let a branch name choose the base.
    expect(planner).toContain("grep -Eq '^[0-9a-f]{40}$'");
    expect(planner).toContain('--event=pull_request --base="$PLAN_FROM"');
  });

  it.each(BROWSER_JOB_IDS)('%s refuses a missing plan', (id) => {
    const job = jobBlock(id);
    expect(job, 'job does not wait for the impact plan').toContain('needs: [changes, build]');
    // `!cancelled()` keeps the job alive when the planner fails, so the run turns red instead of
    // finishing green over skipped jobs.
    expect(job, 'the job disappears after an upstream failure').toContain('!cancelled()');
    const guard = stepBlock(job, 'Require impact plan');
    expect(guard, 'plan failure guard is missing').toContain(
      "if: needs.changes.result != 'success'",
    );
    expect(guard, 'plan failure does not turn the job red').toContain('exit 1');
  });

  it.each(BROWSER_JOB_IDS)('%s prepares Playwright only when assigned evidence', (id) => {
    const job = jobBlock(id);
    const setup = stepBlock(job, 'Setup Playwright');
    expect(setup, 'conditional setup step is missing').toContain("if: env.ACTIVE == 'true'");
    expect(setup).toContain('uses: ./.github/actions/setup-playwright');
    expect(stepBlock(job, 'Skip unaffected Playwright setup'), 'skip evidence is missing').toContain(
      "if: env.ACTIVE != 'true'",
    );
    expect(job, 'the encoded plan is not passed to the executor').toContain(
      'CI_IMPACT_PLAN: ${{ needs.changes.outputs.plan }}',
    );
  });

  it('routes static, web and suite evidence independently', () => {
    const surfaces = jobBlock('surfaces');
    expect(surfaces).toContain("ACTIVE: ${{ needs.changes.outputs.static == 'true' || needs.changes.outputs.web == 'true' }}");
    expect(stepBlock(surfaces, 'Run built-folder evidence')).toContain("if: env.STATIC == 'true'");
    expect(stepBlock(surfaces, 'Run built-folder evidence')).toContain('run-ci-lane.mjs --lane=static');
    // The web lane runs after a red static lane too, so one night shows both verdicts.
    expect(stepBlock(surfaces, 'Run web-surface evidence')).toContain("if: ${{ !cancelled() && env.WEB == 'true' }}");
    expect(stepBlock(surfaces, 'Run web-surface evidence')).toContain('run-ci-lane.mjs --lane=web');
    expect(jobBlock('suite')).toContain("ACTIVE: ${{ needs.changes.outputs.playwright != 'skip' }}");
  });

  it('keeps classification out of the expensive setup action', () => {
    expect(setupAction).not.toContain('classify-change.mjs');
    expect(setupAction).not.toMatch(/^outputs:\s*$/m);
  });
});

describe('quarantined specs run without deciding the night, and an expired entry decides it', () => {
  it('runs the quarantined specs on a whole run, on a job that cannot turn the run red', () => {
    const job = jobBlock('quarantined');
    expect(job).toMatch(/^ {4}continue-on-error: true$/m);
    expect(job).toContain("needs.changes.outputs.playwright == 'full'");
    expect(job).toContain('run: node scripts/ci/quarantine.mjs run-browser');
  });

  it('checks expiry on a whole run, on a job that turns the run red', () => {
    const job = jobBlock('quarantine-expiry');
    expect(job).not.toContain('continue-on-error');
    expect(job).toContain("if: ${{ needs.changes.outputs.playwright == 'full' }}");
    expect(job).toContain('run: node scripts/ci/quarantine.mjs check-expiry');
  });
});

describe('one immutable build feeds every browser job', () => {
  it('builds once and publishes a run-local artifact for this source SHA', () => {
    expect((workflow.match(/run: pnpm build/g) ?? []).length).toBe(1);
    const build = jobBlock('build');
    expect(build).toContain('if-no-files-found: error');
    expect(build).not.toContain('continue-on-error');
    expect(stepBlock(jobBlock('suite'), 'Upload timing evidence')).toContain('continue-on-error: true');
    // The release browser gate and `pnpm pr:land` tell a whole run by this artifact name.
    expect(stepBlock(jobBlock('suite'), 'Upload timing evidence')).toContain(
      'name: playwright-timings-${{ needs.changes.outputs.playwright }}-${{ matrix.shard }}',
    );
    expect(readFileSync(join(ROOT, '.github', 'workflows', 'checks.yml'), 'utf8').match(/- name: Upload lane report\n\s+continue-on-error: true\n/g)).toHaveLength(4);
    expect(build).toContain('name: playwright-built-folders-${{ github.sha }}');
  });

  it.each(BROWSER_JOB_IDS)('%s fails if the shared build fails and downloads the same source', (id) => {
    const job = jobBlock(id);
    expect(job).toContain('needs: [changes, build]');
    expect(job).toContain('PLAYWRIGHT_PREBUILT: "1"');
    const guard = stepBlock(job, 'Require browser artifact');
    expect(guard).toContain("needs.build.result != 'success'");
    expect(guard).toContain('run: exit 1');
    expect(stepBlock(job, 'Download built folders')).toContain('name: playwright-built-folders-${{ github.sha }}');
  });
});
