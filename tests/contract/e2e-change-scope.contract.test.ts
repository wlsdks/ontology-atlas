import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The five branch-protected browser statuses must remain visible, but only jobs
 * assigned evidence by the checkout-only impact planner may install pnpm,
 * Chromium, system packages, or the app. Missing plans fail every protected job.
 */

const ROOT = process.cwd();
const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8');
const setupAction = readFileSync(
  join(ROOT, '.github', 'actions', 'setup-playwright', 'action.yml'),
  'utf8',
);

const PROTECTED_JOB_IDS = ['static-export', 'web-smoke', 'suite'] as const;

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

describe('E2E impact planning precedes expensive setup', () => {
  it('keeps all five protected statuses alive', () => {
    expect(PROTECTED_JOB_IDS.length).toBe(3);
    for (const id of PROTECTED_JOB_IDS) {
      expect(jobBlock(id), `${id} job is missing`).not.toBe('');
    }
    expect(jobBlock('suite'), 'the three Playwright shards disappeared').toContain(
      'shard: [1, 2, 3]',
    );
    expect(2 + 3).toBe(5);
  });

  it('one checkout-only job publishes the encoded plan and three browser decisions', () => {
    const changes = jobBlock('changes');
    expect(changes, 'changes job is missing').not.toBe('');
    for (const output of ['plan', 'playwright', 'static', 'web']) {
      expect(changes, `${output} output is missing`).toContain(
        `      ${output}: ` + '${{ steps.impact.outputs.' + output + ' }}',
      );
    }
    const planner = stepBlock(changes, 'Build impact plan');
    expect(planner).toContain('node scripts/classify-change.mjs');
    expect(planner).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(planner).toContain('BASE_REF: ${{ github.base_ref }}');
    // A merge group has no base branch ref, so the comparison falls back to the
    // SHA GitHub minted for the group (2026-09-12). Both spellings have to be
    // here: dropping either plans a merge group from nothing.
    expect(planner).toContain('MERGE_GROUP_BASE_SHA: ${{ github.event.merge_group.base_sha }}');
    expect(planner).toContain('--event="$EVENT_NAME" --base="${MERGE_GROUP_BASE_SHA:-origin/$BASE_REF}"');
  });

  it.each(PROTECTED_JOB_IDS)('%s refuses a missing plan', (id) => {
    const job = jobBlock(id);
    expect(job, 'job does not wait for the impact plan').toContain('needs: [changes, build]');
    // `!cancelled()` keeps the required status alive when the planner fails;
    // the draft clause keeps a draft pull request from spending a runner at all
    // (2026-09-12). The two are one expression, so both halves are pinned.
    expect(job, 'required status disappears after upstream failure').toContain('!cancelled()');
    expect(job, 'a draft pull request would pay for this job').toContain(
      "github.event.pull_request.draft == false",
    );
    const guard = stepBlock(job, 'Require impact plan');
    expect(guard, 'plan failure guard is missing').toContain(
      "if: needs.changes.result != 'success'",
    );
    expect(guard, 'plan failure does not turn the job red').toContain('exit 1');
  });

  it.each(PROTECTED_JOB_IDS)('%s prepares Playwright only when assigned evidence', (id) => {
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

  it('routes static, web, exact, and broad browser evidence independently', () => {
    expect(jobBlock('static-export')).toContain(
      'ACTIVE: ${{ needs.changes.outputs.static }}',
    );
    expect(jobBlock('web-smoke')).toContain('ACTIVE: ${{ needs.changes.outputs.web }}');
    const suite = jobBlock('suite');
    expect(suite).toContain("needs.changes.outputs.playwright == 'full'");
    expect(suite).toContain("needs.changes.outputs.playwright == 'smoke'");
    expect(suite).toContain("needs.changes.outputs.playwright == 'targeted' && matrix.shard == 1");
  });

  it('keeps classification out of the expensive setup action', () => {
    expect(setupAction).not.toContain('classify-change.mjs');
    expect(setupAction).not.toMatch(/^outputs:\s*$/m);
  });
});

describe('one immutable build feeds every protected browser job', () => {
  it('builds once and publishes a run-local artifact for this source SHA', () => {
    expect((workflow.match(/run: pnpm build/g) ?? []).length).toBe(1);
    const build = jobBlock('build');
    expect(build).toContain('if-no-files-found: error');
    expect(build).not.toContain('continue-on-error');
    expect(stepBlock(jobBlock('suite'), 'Upload timing evidence')).toContain('continue-on-error: true');
    expect(build).toContain('name: playwright-export-${{ github.sha }}');
  });
  it.each(PROTECTED_JOB_IDS)('%s fails if the shared build fails and downloads the same source', (id) => {
    const job=jobBlock(id);
    expect(job).toContain('needs: [changes, build]');
    expect(job).toContain('PLAYWRIGHT_PREBUILT: "1"');
    const guard=stepBlock(job,'Require browser artifact');
    expect(guard).toContain("needs.build.result != 'success'");
    expect(guard).toContain('run: exit 1');
    expect(stepBlock(job,'Download static export')).toContain('name: playwright-export-${{ github.sha }}');
  });
});
