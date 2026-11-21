import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RECORDED_PR, readyPr } from './recorded-rollup.mjs';
import { component, fakeWorld, called } from './fake-github.mjs';
import { CONFLICT_INSTRUCTION, missingChangeRecord, refuseLanding } from './landing-refusals.mjs';
import { createGithub } from './github-cli.mjs';
import { runPrLand } from '../../../landing/pr-land.mjs';

describe('pr:land refusals', () => {
  it('lands only an open pull request against main', () => {
    assert.equal(refuseLanding(readyPr()), null);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'CLOSED' }), /is closed, not open/);
    assert.match(refuseLanding({ ...RECORDED_PR, state: 'MERGED' }), /is merged, not open/);
    assert.match(refuseLanding({ ...RECORDED_PR, baseRefName: 'release' }), /targets release, not main/);
    assert.match(refuseLanding({ ...RECORDED_PR, headRefName: 'train/20260926T101530Z-1' }), /is a landing train/);
  });

  it('hands a conflict back to the author before queueing it', () => {
    const dirty = refuseLanding({ ...RECORDED_PR, mergeStateStatus: 'DIRTY' });
    assert.equal(dirty, CONFLICT_INSTRUCTION);
    assert.match(dirty, /git fetch origin && git merge origin\/main/);
    assert.match(dirty, /pnpm pr:land <number>/);
    assert.match(dirty, /It was not queued/);
    assert.match(dirty, /pnpm docs-vault:resolve-conflicts/);
    assert.equal(refuseLanding({ ...RECORDED_PR, mergeable: 'CONFLICTING' }), CONFLICT_INSTRUCTION);
  });

  it('leaves a fork pull request to a person', () => {
    const refusal = refuseLanding({ ...readyPr(), isCrossRepository: true });
    assert.match(refusal, /fork/);
    assert.match(refusal, /gh pr diff/);
    assert.match(refusal, /core\.hooksPath=\/dev\/null/);
  });
});

describe('a feature lands with its change record', () => {
  const readNothing = () => assert.fail('the changed files were read');
  const recorded = () => ['src/a.ts', 'docs/records/changes/2026-10-10-a-0000.md'];

  it('refuses a feature that adds no record and names both ways out', () => {
    const refusal = missingChangeRecord({ title: 'feat(map): keep the camera still', body: '' }, () => ['src/a.ts']);
    assert.match(refusal, /titled `feat:`/);
    assert.match(refusal, /pnpm record:new -- --kind=change .*--category=<Added\|Changed\|Fixed\|Removed>/);
    assert.match(refusal, /No change record: <why/);
  });

  it('lands a feature once it adds a record', () => {
    for (const title of ['feat: a', 'feat(map): a', 'feat!: a']) {
      assert.equal(missingChangeRecord({ title, body: '' }, recorded), null, title);
    }
  });

  it('lands on a stated reason without reading the files', () => {
    assert.equal(missingChangeRecord({ title: 'feat(ci): a', body: 'Summary\n\nNo change record: only CI timing moved\n' }, readNothing), null);
  });

  it('refuses a declaration with no reason', () => {
    assert.match(missingChangeRecord({ title: 'feat: a', body: 'No change record:   \n' }, () => []), /adds no docs\/records\/changes\/ record/);
  });

  it('never asks a fix, perf, design, chore, docs, refactor, test or fixup pull request', () => {
    for (const title of ['fix(map): a', 'perf!: a', 'design(app): a', 'chore(release): a', 'docs: a', 'refactor: a', 'test: a', 'fixup: a']) {
      assert.equal(missingChangeRecord({ title, body: '' }, readNothing), null, title);
    }
  });

  it('refuses when the changed files cannot be read', () => {
    assert.match(missingChangeRecord({ title: 'feat: a', body: null }, () => null), /could not be read/);
  });

  it('refuses before queueing, and --plan reports the refusal', () => {
    const world = fakeWorld({ prs: [component(61, { body: '' })] });
    assert.equal(runPrLand(['61'], world.io, () => world.deps), 1);
    assert.deepEqual(called(world, 'addLabel'), []);
    assert.ok(world.out.some((line) => line.startsWith('ERROR PR #61 is titled `feat:`')));
    const plan = fakeWorld({ prs: [component(62, { body: '' })], readOnly: true });
    runPrLand(['--plan', '62'], plan.io, () => plan.deps);
    assert.ok(plan.out.some((line) => line.startsWith('PR #62: would be refused — is titled `feat:`')));
  });

  it('reads every page of changed files and survives an unreadable answer', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return 'src/a.ts\ndocs/records/changes/x.md\n'; });
    assert.deepEqual(github.readChangedFiles(7), ['src/a.ts', 'docs/records/changes/x.md']);
    assert.ok(calls[0].includes('--paginate') && calls[0].includes('repos/owner/repo/pulls/7/files'));
    assert.equal(createGithub('owner/repo', () => undefined).readChangedFiles(7), null);
  });
});
