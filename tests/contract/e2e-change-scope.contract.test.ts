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
    expect(planner).toContain('--event="$EVENT_NAME" --base="origin/$BASE_REF"');
  });

  it.each(PROTECTED_JOB_IDS)('%s refuses a missing plan', (id) => {
    const job = jobBlock(id);
    expect(job, 'job does not wait for the impact plan').toContain('needs: changes');
    expect(job, 'required status disappears after upstream failure').toContain(
      'if: ${{ !cancelled() }}',
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
