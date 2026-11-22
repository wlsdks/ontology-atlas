import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { component, fakeWorld, runConductor, called } from './fake-github.mjs';
import { NO_FULL_RUN, SCHEDULED_CHECKS, describeScheduledRun, fullBrowserRunKind } from './main-health.mjs';
import { createGithub } from './github-cli.mjs';
import { runPrLand } from '../../../landing/pr-land.mjs';

describe('scheduled checks on main', () => {
  const now = Date.parse('2026-10-09T12:00:00Z');
  const [browser, acp, postMerge] = SCHEDULED_CHECKS;
  const CASES = [
    ['a green run from today says nothing', browser, { conclusion: 'success', createdAt: '2026-10-08T19:17:00Z', url: 'u' }, null],
    ['a red nightly names its day and link, and that a stable release of it cannot publish', browser, { conclusion: 'failure', createdAt: '2026-10-08T19:17:00Z', url: 'https://x/1' }, /nightly browser run on main failed on 2026-10-08 \(https:\/\/x\/1\), with no failing spec annotated \(open the run\); merging continues, but a stable release of that commit cannot publish/],
    ['a green run older than two days says the schedule stalled', acp, { conclusion: 'success', createdAt: '2026-10-05T19:17:00Z', url: 'u' }, /is from 2026-10-05/],
    ['a green nightly older than two days says the nightly stalled', browser, { conclusion: 'success', createdAt: '2026-10-07T10:00:00Z', url: 'u' }, /the last nightly browser run on main is from 2026-10-07; .*stable release cannot publish without a green whole run/],
    ['a green nightly inside two days says nothing', browser, { conclusion: 'success', createdAt: '2026-10-07T13:00:00Z', url: 'u' }, null],
    ['an unreadable run says nothing', browser, null, null],
    ['a red post-merge Checks run says main inherited the red', postMerge, { conclusion: 'failure', createdAt: '2026-10-09T10:00:00Z', url: 'https://x/3' }, /post-merge full Checks run on main failed on 2026-10-09 \(https:\/\/x\/3\)/],
    ['an old green post-merge run is not a stalled schedule', postMerge, { conclusion: 'success', createdAt: '2026-10-01T10:00:00Z', url: 'u' }, null],
    ['a red ACP registry check names the command that shows what moved', acp, { conclusion: 'failure', createdAt: '2026-10-08T03:41:00Z', url: 'https://x/2' }, /ACP registry check on main failed on 2026-10-08 .*`pnpm acp:registry:check`/],
  ];
  for (const [name, check, run, expected] of CASES) {
    it(name, () => {
      const said = describeScheduledRun(check, run, now);
      if (expected === null) assert.equal(said, null);
      else assert.match(said, expected);
    });
  }

  it('reads the newest finished scheduled run of the named workflow and survives an unreadable answer', () => {
    const calls = [];
    const finished = { conclusion: 'failure', createdAt: '2026-10-08T19:17:00Z', url: 'u' };
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify([finished]); });
    assert.deepEqual(github.readScheduledRun('acp-registry.yml'), finished);
    assert.ok(calls[0].includes('acp-registry.yml') && calls[0].includes('schedule') && calls[0].includes('main'));
    assert.equal(createGithub('owner/repo', () => undefined).readScheduledRun('e2e.yml'), null);
  });

  it('reads past a cancelled main push to the newest verdict', () => {
    const calls = [];
    const red = { conclusion: 'failure', createdAt: '2026-10-09T09:00:00Z', url: 'u' };
    const github = createGithub('owner/repo', (args) => {
      calls.push(args);
      return JSON.stringify([{ conclusion: '' }, { conclusion: 'cancelled' }, red]);
    });
    assert.deepEqual(github.readScheduledRun('checks.yml', 'push'), red);
    assert.ok(calls[0].includes('push'));
  });

  it('warns at landing for every red check on main, and a red browser run names its failing specs', () => {
    const red = (workflow) => ({ conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: `https://x/${workflow}` });
    const world = fakeWorld({ prs: [component(71)] });
    world.deps.gh.readScheduledRun = (workflow) => (workflow === 'e2e.yml'
      ? { ...red(workflow), failingSpecs: ['tests/e2e/a.spec.ts', 'tests/e2e/b/c.spec.ts'] }
      : red(workflow));
    runPrLand(['71'], world.io, () => world.deps);
    const warnings = world.out.filter((line) => line.startsWith('ERROR warning:'));
    for (const workflow of ['e2e.yml', 'acp-registry.yml', 'checks.yml']) {
      assert.ok(warnings.some((line) => line.includes(`https://x/${workflow}`)), workflow);
    }
    const browser = warnings.find((line) => line.includes('https://x/e2e.yml'));
    assert.match(browser, /nightly browser run on main failed on 2026-09-26 \(https:\/\/x\/e2e\.yml\): tests\/e2e\/a\.spec\.ts, tests\/e2e\/b\/c\.spec\.ts; merging continues/);
  });

  it('reads the post-merge Checks verdict from the push run, not the nightly one', () => {
    const world = fakeWorld({ prs: [component(72)] });
    const asked = [];
    world.deps.gh.readScheduledRun = (workflow, event) => {
      asked.push(`${workflow}:${event ?? 'schedule'}`);
      return workflow === 'checks.yml' && event === 'push'
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/push-run' }
        : { conclusion: 'success', createdAt: new Date(world.deps.now()).toISOString(), url: 'u' };
    };
    runPrLand(['72'], world.io, () => world.deps);
    assert.ok(asked.includes('checks.yml:push'), asked.join(', '));
    assert.ok(world.out.some((line) => line.startsWith('ERROR warning:') && line.includes('https://x/push-run')));
  });

  it('reads the browser verdict from the nightly run with whole-run checks, and nothing else does', () => {
    const world = fakeWorld({ prs: [component(73)] });
    const asked = [];
    world.deps.gh.readScheduledRun = (workflow, event, options = {}) => {
      asked.push(`${workflow}:${event ?? 'schedule'}:${options.fullBrowser === true}`);
      return workflow === 'e2e.yml' && event === 'schedule' && options.fullBrowser
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/browser-push', failingSpecs: ['tests/e2e/a.spec.ts'] }
        : { conclusion: 'success', createdAt: new Date(world.deps.now()).toISOString(), url: 'u' };
    };
    runPrLand(['73'], world.io, () => world.deps);
    assert.deepEqual(asked.sort(), ['acp-registry.yml:schedule:false', 'checks.yml:push:false', 'e2e.yml:schedule:true']);
    assert.ok(world.out.some((line) => line.startsWith('ERROR warning:') && line.includes('https://x/browser-push')));
  });

  it('a red browser run on main is a line, not a refusal: the same landing still merges', () => {
    const land = (failing) => {
      const world = fakeWorld({ prs: [component(72)], queued: [72] });
      world.deps.gh.readScheduledRun = (workflow) => (workflow === 'e2e.yml' && failing
        ? { conclusion: 'failure', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/run', failingSpecs: ['tests/e2e/a.spec.ts'] }
        : { conclusion: 'success', createdAt: '2026-09-26T03:00:00Z', url: 'https://x/run' });
      return { world, result: runConductor(world) };
    };
    const green = land(false);
    const red = land(true);
    assert.deepEqual(red.result.landed, green.result.landed);
    assert.deepEqual(red.result.landed, [72]);
    assert.match(called(red.world, 'openPr')[0][1].body, /- Not this train's gate: the nightly browser run on main failed on 2026-09-26 \(https:\/\/x\/run\): tests\/e2e\/a\.spec\.ts;/);
    assert.doesNotMatch(called(green.world, 'openPr')[0][1].body, /Not this train's gate/);
  });

  it('reads the newest nightly on main that really ran the whole suite, and the specs its failed jobs annotated', () => {
    const calls = [];
    const artifacts = {
      9: 'playwright-timings-smoke-1\nplaywright-timings-smoke-2\n', // a run that planned only a change
      8: '', // a green run whose shards executed nothing
      6: 'playwright-timings-full-1\nplaywright-report-shard-3\nplaywright-timings-full-3\n',
    };
    const github = createGithub('owner/repo', (args) => {
      calls.push(args);
      if (args[0] === 'run') {
        return JSON.stringify([
          { conclusion: '', createdAt: '2026-10-09T11:00:00Z', url: 'running', databaseId: 11 },
          { conclusion: 'cancelled', createdAt: '2026-10-09T10:30:00Z', url: 'cancelled', databaseId: 10 },
          { conclusion: 'failure', createdAt: '2026-10-09T10:00:00Z', url: 'partial', databaseId: 9 },
          { conclusion: 'success', createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:10:00Z', url: 'empty', databaseId: 8 },
          { conclusion: 'success', createdAt: '2026-10-09T08:50:00Z', updatedAt: '2026-10-09T08:50:45Z', url: 'reused', databaseId: 5 },
          { conclusion: 'failure', createdAt: '2026-10-09T08:00:00Z', url: 'https://x/6', databaseId: 6 },
        ]);
      }
      const artifact = /\/actions\/runs\/(\d+)\/artifacts/.exec(args[1]);
      if (artifact) return artifacts[artifact[1]];
      if (args[1].endsWith('/actions/runs/6/jobs?per_page=100')) return '41\n42\n';
      if (args[1].endsWith('/check-runs/41/annotations')) return 'tests/e2e/b.spec.ts\ntests/e2e/a.spec.ts\n';
      if (args[1].endsWith('/check-runs/42/annotations')) return 'tests/e2e/a.spec.ts\n../etc/passwd\n';
      return undefined;
    });
    assert.deepEqual(github.readScheduledRun('e2e.yml', 'schedule', { fullBrowser: true }), {
      conclusion: 'failure', createdAt: '2026-10-09T08:00:00Z', url: 'https://x/6',
      failingSpecs: ['tests/e2e/a.spec.ts', 'tests/e2e/b.spec.ts'],
    });
    const listed = calls[0].join(' ');
    assert.match(listed, /--workflow e2e\.yml --event schedule --branch main/);
    assert.ok(calls.some((args) => args.includes('.[] | select(.title == "failing spec") | .path')));
    assert.equal(createGithub('owner/repo', () => undefined).readScheduledRun('e2e.yml', 'schedule', { fullBrowser: true }), null);
    assert.ok(!calls.some((args) => /\/runs\/5\//.test(args[1] ?? '')), 'a 45-second reused push costs no artifact read');
  });

  it('says so when main has nightly runs but none of them ran the whole suite, instead of looking green', () => {
    const github = createGithub('owner/repo', (args) => {
      if (args[0] === 'run') {
        return JSON.stringify([
          { conclusion: 'cancelled', createdAt: '2026-10-09T10:30:00Z', url: 'cancelled', databaseId: 10 },
          { conclusion: 'success', createdAt: '2026-10-09T10:00:00Z', updatedAt: '2026-10-09T10:00:45Z', url: 'https://x/reused', databaseId: 9 },
          { conclusion: 'success', createdAt: '2026-10-09T09:00:00Z', updatedAt: '2026-10-09T09:06:00Z', url: 'https://x/partial', databaseId: 8 },
        ]);
      }
      if (/\/actions\/runs\/8\/artifacts/.test(args[1])) return 'playwright-timings-smoke-1\n';
      return undefined;
    });
    const verdict = github.readScheduledRun('e2e.yml', 'schedule', { fullBrowser: true });
    assert.deepEqual(verdict, { conclusion: NO_FULL_RUN, createdAt: '2026-10-09T10:00:00Z', url: 'https://x/reused', examined: 2 });
    const [browser] = SCHEDULED_CHECKS;
    assert.equal(
      describeScheduledRun(browser, verdict, Date.parse('2026-10-09T12:00:00Z')),
      "main's latest 2 nightly browser runs did not run the whole browser suite (newest: https://x/reused), so a red spec would not show here",
    );
    assert.equal(createGithub('owner/repo', (args) => (args[0] === 'run' ? '[]' : undefined)).readScheduledRun('e2e.yml', 'schedule', { fullBrowser: true }), null, 'no nightly yet is not a finding');
  });

  it('counts a run as full only by what its shards uploaded', () => {
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-full-2', 'x']), 'full');
    assert.equal(fullBrowserRunKind('failure', ['playwright-timings-smoke-1']), 'partial');
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-targeted-1']), 'partial');
    assert.equal(fullBrowserRunKind('success', ['playwright-timings-3']), 'partial', 'a push from before the mode was named');
    assert.equal(fullBrowserRunKind('success', []), 'empty', 'a reused push that ran nothing proves nothing');
    assert.equal(fullBrowserRunKind('failure', []), 'full', 'red before any spec ran is still red');
  });

  it('names only workflows that run on the event it reads', () => {
    for (const { workflow, event = 'schedule' } of SCHEDULED_CHECKS) {
      assert.match(readFileSync(join('.github/workflows', workflow), 'utf8'), new RegExp(`^ {2}${event}:`, 'm'), workflow);
    }
  });
});
