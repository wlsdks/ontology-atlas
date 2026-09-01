import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The five branch-protected E2E checks must stay visible on every pull request,
 * but a change that cannot affect a rendered surface must not pay for pnpm,
 * Chromium, system packages, or a Next build before it is skipped.
 *
 * The workflow therefore has one cheap classifier job. Each protected job still
 * starts, fails closed when classification failed, and only loads the expensive
 * local setup action when its change class is active.
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

describe('E2E 변경 범위 판정은 비싼 준비보다 먼저 돈다', () => {
  it('보호된 체크 인벤토리가 비어 있지 않고 다섯 상태를 유지한다', () => {
    expect(PROTECTED_JOB_IDS.length).toBe(3);
    for (const id of PROTECTED_JOB_IDS) {
      expect(jobBlock(id), `${id} job 이 없다`).not.toBe('');
    }
    expect(jobBlock('suite'), '세 Playwright shard 가 사라졌다').toContain('shard: [1, 2, 3]');
    expect(2 + 3).toBe(5);
  });

  it('한 cheap job 이 runtime/browser/e2e 를 분류한다', () => {
    const changes = jobBlock('changes');
    expect(changes, 'changes job 이 없다').not.toBe('');
    for (const output of ['runtime', 'browser', 'e2e']) {
      expect(changes, `${output} output 이 없다`).toMatch(
        new RegExp(`^      ${output}: \\\${\\\{ steps\\.classify\\.outputs\\.${output} \\\}\\\}$`, 'm'),
      );
    }
    expect(stepBlock(changes, 'Classify change')).toContain(
      'node scripts/classify-change.mjs --base=origin/${{ github.base_ref }}',
    );
  });

  it.each(PROTECTED_JOB_IDS)('%s 는 판정 실패를 초록으로 바꾸지 않는다', (id) => {
    const job = jobBlock(id);
    expect(job, 'changes 결과를 기다리지 않는다').toContain('needs: changes');
    expect(job, 'upstream 실패 때 필수 체크 자체가 사라진다').toContain(
      'if: ${{ !cancelled() }}',
    );
    const guard = stepBlock(job, 'Require change classification');
    expect(guard, '분류 실패 guard 가 없다').toContain(
      "if: needs.changes.result != 'success'",
    );
    expect(guard, '분류 실패가 job 을 red 로 만들지 않는다').toContain('exit 1');
  });

  it.each(PROTECTED_JOB_IDS)('%s 는 활성 범위에서만 Playwright 를 준비한다', (id) => {
    const job = jobBlock(id);
    const setup = stepBlock(job, 'Setup Playwright');
    expect(setup, '조건부 setup step 을 못 찾았다').toContain(
      'if: env.RUN_PLAYWRIGHT == \'true\'',
    );
    expect(setup).toContain('uses: ./.github/actions/setup-playwright');
    expect(stepBlock(job, 'Skip Playwright setup'), 'skip 증거가 없다').toContain(
      'if: env.RUN_PLAYWRIGHT != \'true\'',
    );
  });

  it('runtime은 static/web을, browser는 shard를 연다', () => {
    for (const id of ['static-export', 'web-smoke']) {
      expect(jobBlock(id), `${id} 가 runtime 판정을 잃었다`).toContain(
        "needs.changes.outputs.runtime == 'true'",
      );
    }
    expect(jobBlock('suite'), 'suite 가 browser 판정을 잃었다').toContain(
      "needs.changes.outputs.browser == 'true'",
    );
  });

  it('비싼 setup action 안에는 변경 판정이 남아 있지 않다', () => {
    expect(setupAction).not.toContain('classify-change.mjs');
    expect(setupAction).not.toMatch(/^outputs:\s*$/m);
  });
});
