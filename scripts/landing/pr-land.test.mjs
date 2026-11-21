import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAST_LOCK_REF, LEASE_MINUTES, LOCK_REF, lockTrains } from '../lib/landing/pr-land/landing-lock.mjs';
import { REQUIRED_CONTEXTS, green, red } from '../lib/landing/pr-land/recorded-rollup.mjs';
import { component, fakeWorld, runConductor, called } from '../lib/landing/pr-land/fake-github.mjs';
import { createGithub } from '../lib/landing/pr-land/github-cli.mjs';
import { runPrLand } from './pr-land.mjs';
import { EJECTED_MARKER, LANDED_MARKER, RED_CLOSE_PREFIX } from '../lib/landing/landing-train.mjs';

describe('the conductor runs trains', () => {
  for (const mode of ['train', 'fast']) {
  it(`retains ten original commit identities, messages and authors through real Git ${mode} integration`, () => {
    const root = mkdtempSync(join(tmpdir(), 'atlas-history-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    try {
      git('init', '-b', 'main');
      git('config', 'user.name', 'Conductor');
      git('config', 'user.email', 'conductor@example.com');
      writeFileSync(join(root, 'base.txt'), 'base');
      git('add', 'base.txt');
      git('commit', '-m', 'chore: base');
      const base = git('rev-parse', 'HEAD');
      git('switch', '-c', 'feat/original');
      const originals = [];
      for (let i = 1; i <= 10; i += 1) {
        writeFileSync(join(root, 'work.txt'), String(i));
        git('add', 'work.txt');
        git('-c', `user.name=Author ${i}`, '-c', `user.email=author${i}@example.com`, 'commit', '-m', `feat: original step ${i}`, '-m', `Evidence for step ${i}.`);
        originals.push(git('show', '-s', '--format=%H%x00%B%x00%an%x00%ae', 'HEAD'));
      }
      const head = git('rev-parse', 'HEAD');
      const world = fakeWorld({ prs: [component(11, { headRefOid: head, headRefName: 'feat/original', isDraft: mode !== 'fast', statusCheckRollup: mode === 'fast' ? green() : [] })], queued: [11] });
      const createBranch = world.deps.gh.createBranch;
      world.deps.gh.createBranch = (branch, sha) => { git('branch', branch, sha); return createBranch(branch, sha); };
      const mergeInto = world.deps.gh.mergeInto;
      world.deps.gh.mergeInto = (branch, sha, message) => {
        git('switch', branch);
        git('merge', '--no-ff', sha, '-m', message);
        return mergeInto(branch, sha, message);
      };
      world.deps.gh.squashOnto = () => { throw new Error('original commit history must never be squashed'); };
      const mergePr = world.deps.gh.mergePr;
      world.deps.gh.mergePr = (number, options) => {
        assert.equal(options.method, 'merge');
        git('switch', 'main');
        git('merge', '--no-ff', world.pulls.get(number).headRefName, '-m', `chore(train): land #${number}`);
        return mergePr(number, options);
      };
      const revParse = world.deps.git.revParse;
      world.deps.git.revParse = (ref) => ref === 'origin/main' ? base : revParse(ref);
      if (mode === 'train') assert.equal(runConductor(world).state, 'drained');
      else assert.equal(runPrLand(['11'], world.io, () => world.deps), 0);
      const reachable = new Set(git('rev-list', 'main').split('\n'));
      for (const original of originals) {
        const sha = original.split('\0')[0];
        assert.ok(reachable.has(sha), `original commit ${sha} must remain reachable from main`);
        assert.equal(git('show', '-s', '--format=%H%x00%B%x00%an%x00%ae', sha), original);
      }
      assert.equal(originals.length, 10);
      assert.equal(Number(git('rev-list', '--count', '--merges', 'main')), mode === 'train' ? 2 : 1, 'fast PRs add one merge; trains also retain their integration merge');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  }

  it('lands a green train behind one CI run, ejecting a conflicting component and continuing', () => {
    const world = fakeWorld({ prs: [component(11), component(12), component(13)], queued: [11, 12, 13], conflicts: new Set([12]) });
    const result = runConductor(world);

    assert.equal(result.state, 'drained');
    assert.deepEqual(result.landed, [11, 13]);
    assert.equal(called(world, 'openPr').length, 1, 'one CI run for the whole train');
    assert.match(called(world, 'openPr')[0][1].title, /^chore\(merge\): #11 #13$/);
    assert.match(called(world, 'openPr')[0][1].body, /- #11 `feat\/change-11@11ccccccc` feat: change 11/);

    const [merge] = called(world, 'mergePr');
    assert.equal(merge[2].sha, 'train-head-2001', 'the merge is pinned to the head CI measured');
    assert.equal(merge[2].method, 'merge', 'the train must preserve its original commit ancestry');
    assert.equal(called(world, 'squashOnto').length, 0, 'no component history may be rewritten');
    assert.deepEqual(called(world, 'mergeInto').map(([, , sha, message]) => [sha, message]), [
      [component(11).headRefOid, 'feat: change 11 (#11)'],
      [component(12).headRefOid, 'feat: change 12 (#12)'],
      [component(13).headRefOid, 'feat: change 13 (#13)'],
    ]);

    const ejected = world.pulls.get(12);
    assert.equal(ejected.state, 'OPEN');
    assert.deepEqual(ejected.labels, []);
    assert.ok(ejected.comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.match(ejected.comments.at(-1).body, /#11, which are ahead of it/);

    for (const number of [11, 13]) {
      const pr = world.pulls.get(number);
      assert.equal(pr.state, 'CLOSED');
      assert.ok(pr.comments.at(-1).body.startsWith(LANDED_MARKER));
      assert.match(pr.comments.at(-1).body, /train #2001/);
    }
    const deleted = called(world, 'deleteBranch').map(([, branch]) => branch);
    assert.ok(deleted.includes('feat/change-11') && deleted.includes('feat/change-13'));
    assert.ok(!deleted.includes('feat/change-12'), 'an ejected component keeps its branch');
    assert.equal(world.locks.has(LOCK_REF), false, 'the lock is released when the queue drains');
  });

  it('merges a green train only while holding the fast-path lock, then releases it', () => {
    const world = fakeWorld({ prs: [component(21)], queued: [21] });
    const merge = world.deps.gh.mergePr;
    const heldAtMerge = [];
    world.deps.gh.mergePr = (...args) => {
      heldAtMerge.push(world.locks.has(FAST_LOCK_REF));
      return merge(...args);
    };
    const result = runConductor(world);

    assert.deepEqual(result.landed, [21]);
    assert.deepEqual(heldAtMerge, [true], 'no fast-path merge can land between the drift check and this merge');
    assert.equal(world.locks.has(FAST_LOCK_REF), false);
  });

  it('waits for main to reach the squash commit before judging a component landed', () => {
    const world = fakeWorld({ prs: [component(31)], queued: [31] });
    const merge = world.deps.gh.mergePr;
    let squash = null;
    world.deps.gh.mergePr = (number, options) => {
      const result = merge(number, options);
      squash = `squash-${number}`;
      return { ...result, sha: squash };
    };
    // GitHub answers the merge before origin/main moves: two stale reads, then the squash.
    let reads = 0;
    const revParse = world.deps.git.revParse;
    world.deps.git.revParse = (ref) => {
      if (ref !== 'origin/main' || squash === null) return revParse(ref);
      reads += 1;
      return reads > 2 ? squash : revParse(ref);
    };
    const contained = world.deps.git.isContained;
    world.deps.git.isContained = (base, sha) => (reads > 2 ? contained(base, sha) : false);
    const result = runConductor(world);

    assert.deepEqual(result.landed, [31]);
    assert.equal(called(world, 'openPr').length, 1, 'one train, not a second one for a component that already landed');
    assert.equal(world.pulls.get(31).state, 'CLOSED');
  });

  it('never queues a component a merged train carried again, even when containment is unproven', () => {
    const world = fakeWorld({ prs: [component(32)], queued: [32] });
    world.deps.git.isContained = () => false;
    world.deps.git.isAncestor = () => false;
    runConductor(world);

    assert.equal(called(world, 'openPr').length, 1, 'a second train would land it twice');
    const pr = world.pulls.get(32);
    assert.deepEqual(pr.labels, []);
    assert.match(pr.comments.at(-1).body, /does not provably contain/);
  });

  it('bisects a red train and ejects only the breaker', () => {
    const breaker = 3;
    const world = fakeWorld({
      prs: [1, 2, 3, 4].map((n) => component(n)),
      queued: [1, 2, 3, 4],
      ci: (numbers) => (numbers.includes(breaker) ? red(['Unit · Contract']) : green()),
    });
    // Sequential, so the halves read in order; the speculative bisect is below.
    const result = runConductor(world, { speculate: false });
    assert.deepEqual(result.landed, [1, 2, 4]);
    const trains = called(world, 'openPr').map(([, { title }]) => title);
    assert.deepEqual(trains, [
      'chore(merge): #1 #2 #3 #4',
      'chore(merge): #1 #2',
      'chore(merge): #3 #4',
      'chore(merge): #3 — feat: change 3',
      'chore(merge): #4 — feat: change 4',
    ]);
    const note = world.pulls.get(3).comments.at(-1).body;
    assert.ok(note.startsWith(EJECTED_MARKER));
    assert.match(note, /Unit · Contract FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/777/);
    assert.deepEqual(world.pulls.get(3).labels, []);
  });

  it('reruns the failed jobs of a lone red train once instead of ejecting, flagged or not', () => {
    const flakyCi = (numbers, reruns) => (reruns === 0 ? red(['Playwright (chromium 2/3)'], 991) : green());
    const flaky = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(flaky, { flaky: ['Playwright (chromium 2/3)'] }).landed, [7]);
    assert.deepEqual(called(flaky, 'rerunFailed').map(([, id]) => id), ['991']);
    assert.equal(called(flaky, 'openPr').length, 1, 'a rerun reuses the train, not a new CI run set');

    const unflagged = fakeWorld({ prs: [component(7)], queued: [7], ci: flakyCi });
    assert.deepEqual(runConductor(unflagged).landed, [7]);
    assert.equal(called(unflagged, 'rerunFailed').length, 1);

    const real = fakeWorld({ prs: [component(7)], queued: [7], ci: () => red(['MCP'], 992) });
    assert.deepEqual(runConductor(real).landed, []);
    assert.equal(called(real, 'rerunFailed').length, 1, 'one rerun, then the author gets it back');
    assert.ok(real.pulls.get(7).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });

  it('settles a lone red train as red at once when GitHub refuses its rerun', () => {
    const world = fakeWorld({ prs: [component(8)], queued: [8], ci: () => red(['MCP'], 993) });
    let asked = 0;
    world.deps.gh.rerunFailed = () => { asked += 1; return false; };
    assert.deepEqual(runConductor(world).landed, []);
    assert.equal(asked, 1);
    assert.ok(world.out.some((line) => /train #\d+ is red and GitHub refused to rerun its failed jobs; settling it as red/.test(line)));
    assert.ok(world.pulls.get(8).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });

  it('rebuilds a green train when main moved into its files while CI ran', () => {
    const world = fakeWorld({
      prs: [component(5)],
      queued: [5],
      mainDrift: (trainIndex) => (trainIndex === 1 ? ['src/change-5.ts'] : ['src/unrelated.ts']),
    });
    const result = runConductor(world);
    assert.deepEqual(result.landed, [5]);
    assert.equal(called(world, 'openPr').length, 2, 'the drifted train was rebuilt once on the new main');
    assert.match(called(world, 'closePr')[0][2], /main moved into src\/change-5.ts/);
  });

  /*
   * ⚠️ The conductor renews its lease before every wait. A wait that skipped the refresh would
   * age the lock past its lease under a live conductor and invite the next lander to force-take
   * it: two conductors on one lock, the defect this file exists to prevent.
   */
  it('renews the lease before every wait it makes while holding the lock', () => {
    const world = fakeWorld({ prs: [component(1), component(2)], queued: [1, 2], ci: (numbers) => (numbers.length > 1 ? red(['MCP']) : green()) });
    runConductor(world);
    const holding = world.events.slice(world.events.indexOf(`take ${LOCK_REF}`), world.events.indexOf(`release ${LOCK_REF}`));
    const sleeps = holding.map((event, index) => [event, index]).filter(([event]) => event === 'sleep');
    assert.ok(sleeps.length > 3);
    for (const [, index] of sleeps) assert.equal(holding[index - 1], 'refresh', `a wait at event ${index} was not preceded by a refresh`);
  });

  it('takes out a queued pull request it must refuse, without stopping the train', () => {
    const world = fakeWorld({ prs: [component(8, { mergeable: 'CONFLICTING' }), component(9)], queued: [8, 9] });
    assert.deepEqual(runConductor(world).landed, [9]);
    assert.ok(world.pulls.get(8).comments.at(-1).body.startsWith(EJECTED_MARKER));
  });
});

/*
 * Two trains in flight. The second is cut from the first one's head while the first one's CI
 * runs, so both CI runs overlap; it lands only after the first one lands, and is closed, never
 * merged, when the first one does not.
 */
describe('a speculative second train', () => {
  const prs = () => [1, 2, 3, 4].map((n) => component(n));
  const titles = (world) => called(world, 'openPr').map(([, { title }]) => title);
  const index = (world, name, predicate = () => true) => world.calls.findIndex((call) => call[0] === name && predicate(call));

  it('lands A then B, one CI run each, with B\'s CI running while A\'s does', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4] });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [1, 2, 3, 4]);
    assert.deepEqual(titles(world), ['chore(merge): #1 #2', 'chore(merge): #3 #4'], 'two trains, one CI run each');
    assert.deepEqual(called(world, 'mergePr').map(([, number]) => number), [2001, 2002], 'merged in order: A, then B');
    const bOpened = index(world, 'openPr', ([, o]) => o.title.endsWith('#3 #4'));
    assert.ok(bOpened < index(world, 'mergePr'), 'B opened before A merged: the two CI runs overlapped');
    assert.ok(bOpened < index(world, 'readPr', ([, n]) => n === 2001), 'B opened before A was even polled');

    const [, bBranch, bBase] = called(world, 'createBranch')[1];
    assert.match(bBranch, /^train\/.*-3$/);
    assert.match(bBase, /^head:train\/.*-1$/, 'B is cut from A\'s head, not from main');
    assert.match(called(world, 'openPr')[1][1].body, /onto train #2001 .*speculatively/);
    assert.equal(called(world, 'closePr').filter(([, n]) => n >= 2001).length, 0, 'nothing discarded');

    // Both file sets were in the lock while both flew, so a fast path saw both.
    const both = called(world, 'refreshLock').map(([, , body]) => body).find((body) => body.trains?.length === 2 && body.trains.every((t) => t.pr));
    assert.ok(both, 'the lock recorded two trains in flight');
    assert.deepEqual(both.trains.map((t) => t.files), [['src/change-1.ts', 'src/change-2.ts'], ['src/change-3.ts', 'src/change-4.ts']]);
    assert.deepEqual(both.train.files, ['src/change-1.ts', 'src/change-2.ts', 'src/change-3.ts', 'src/change-4.ts']);
    assert.equal(both.pr, 2001);
  });

  it('discards B when A goes red, never merges it, and rebuilds it from main after the bisect', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(1) ? red(['MCP']) : green()) });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [2, 3, 4]);
    assert.deepEqual(titles(world), [
      'chore(merge): #1 #2',
      'chore(merge): #3 #4', // speculative on A: discarded
      'chore(merge): #1 — feat: change 1',
      'chore(merge): #2 — feat: change 2', // speculative on #1: discarded, its half put back
      'chore(merge): #2 — feat: change 2',
      'chore(merge): #3 #4', // speculative on #2, which lands: so does this
    ]);
    const merged = called(world, 'mergePr').map(([, n]) => n);
    assert.ok(!merged.includes(2002) && !merged.includes(2004), 'a discarded train is never merged');
    assert.deepEqual(merged, [2005, 2006]);
    const discard = world.pulls.get(2002).comments.at(-1).body;
    assert.match(discard, /^Discarded: it was cut on top of train #2001, which went red/);
    assert.ok(!discard.startsWith(RED_CLOSE_PREFIX), 'a discard is not counted as a red train');
    assert.ok(world.pulls.get(1).comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.equal(called(world, 'createBranch')[4][2], 'main'.padEnd(40, '0'), 'after the bisect, the rebuilt train is cut from main');
  });

  it('lands A and bisects B when B is red on top of a green A', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(4) ? red(['Unit · Contract']) : green()) });
    const result = runConductor(world, { batch: 2 });

    assert.deepEqual(result.landed, [1, 2, 3]);
    assert.deepEqual(called(world, 'mergePr').map(([, n]) => n), [2001, 2003]);
    const bClose = world.pulls.get(2002).comments.at(-1).body;
    assert.ok(bClose.startsWith(RED_CLOSE_PREFIX), 'B is judged red on its own, after A landed');
    assert.match(bClose, /Split into #3 \| #4/);
    assert.deepEqual(titles(world).slice(2), ['chore(merge): #3 — feat: change 3', 'chore(merge): #4 — feat: change 4']);
    assert.ok(world.pulls.get(4).comments.at(-1).body.startsWith(EJECTED_MARKER));
    assert.equal(world.pulls.get(3).state, 'CLOSED');
  });

  it('bisects with speculation too: the second half rides on the first', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4], ci: (numbers) => (numbers.includes(3) ? red(['Unit · Contract']) : green()) });
    assert.deepEqual(runConductor(world).landed, [1, 2, 4]);
    assert.equal(titles(world)[2], 'chore(merge): #3 #4');
    assert.match(called(world, 'openPr')[2][1].body, /onto train #2002/, 'the second half was cut on the first half');
  });

  it('keeps one train in flight with --no-speculate', () => {
    const world = fakeWorld({ prs: prs(), queued: [1, 2, 3, 4] });
    runConductor(world, { batch: 2, speculate: false });
    assert.ok(index(world, 'mergePr') < index(world, 'openPr', ([, o]) => o.title.endsWith('#3 #4')));
  });

  it('records the head train with the union of files for a reader that knows only `train`', () => {
    assert.deepEqual(lockTrains([]), { train: null, trains: [] });
    const both = lockTrains([{ pr: 1, files: ['b'] }, { pr: 2, files: ['a', 'b'] }]);
    assert.deepEqual(both.train, { pr: 1, files: ['a', 'b'] });
    assert.equal(lockTrains([{ pr: 1, files: ['b'] }, { pr: null, files: null }]).train.files, null, 'assembling: unknown, never partial');
  });
});

describe('the train size a conductor chooses', () => {
  const trainPr = (number, size, red) => ({
    number,
    title: `chore(train): land ${Array.from({ length: size }, (_, i) => `#${number * 100 + i}`).join(' ')}`,
    state: red ? 'CLOSED' : 'MERGED',
    headRefName: `train/20260926T100000Z-${number}`,
    comments: red ? [{ body: `${RED_CLOSE_PREFIX}MCP FAILURE. Split into halves.` }] : [],
  });
  const land = (world, argv) => runPrLand(argv, world.io, () => world.deps);

  it('measures it from recent trains when --batch is absent, and prints why', () => {
    // 12 of 20 ten-PR trains green: p is about 5 %, so a train of 13.
    const history = Array.from({ length: 20 }, (_, i) => trainPr(i + 1, 10, i >= 12));
    const world = fakeWorld({ prs: Array.from({ length: 16 }, (_, i) => component(i + 1)), queued: Array.from({ length: 16 }, (_, i) => i + 1), history });
    assert.equal(land(world, ['--conduct']), 0);
    assert.ok(world.out.some((line) => /train size 13: 20 recent train\(s\), 8 red; about 5\.0 %/.test(line)));
    assert.equal(called(world, 'openPr')[0][1].title.match(/#\d+/g).length, 13);
  });

  it('lets --batch override the measurement', () => {
    const world = fakeWorld({ prs: [component(1), component(2)], queued: [1, 2], history: [] });
    assert.equal(land(world, ['--conduct', '--batch=1']), 0);
    assert.ok(world.out.some((line) => line === 'train size 1 (--batch)'));
  });

  it('keeps the default when the history is short or unreadable', () => {
    const world = fakeWorld({ prs: [component(1)], queued: [1], history: [trainPr(1, 1, true)] });
    land(world, ['--conduct']);
    assert.ok(world.out.some((line) => /train size 20: 1 recent train\(s\), 1 red; fewer than 8/.test(line)));
    const unreadable = fakeWorld({ prs: [component(1)], queued: [1], history: null });
    land(unreadable, ['--conduct']);
    assert.ok(unreadable.out.some((line) => /train size 20: recent trains could not be read/.test(line)));
  });
});

describe('pnpm pr:land <n>, end to end against the fake', () => {
  const land = (world, argv) => runPrLand(argv, world.io, () => world.deps);

  it('queues a draft main moved into, conducts when the lock is free, and exits 0 once it landed', () => {
    const world = fakeWorld({ prs: [component(21)], mainMoves: () => ['src/change-21.ts'] });
    assert.equal(land(world, ['21']), 0);
    assert.ok(world.out.some((line) => /FAIL ready-green/.test(line)), 'the fast-path verdict is printed rule by rule');
    assert.ok(world.out.some((line) => /taking the train: contains-main, disjoint-from-main/.test(line)));
    assert.equal(called(world, 'markReady').length, 0, 'a change the fast path cannot take spends no run of its own');
    assert.ok(world.out.some((line) => /PR #21 landed through a train/.test(line)));
    assert.equal(called(world, 'addLabel').length, 1);
    assert.equal(world.pulls.get(21).state, 'CLOSED');
  });

  it('marks a disjoint draft ready, waits for its own CI and merges it without a train', () => {
    const world = fakeWorld({ prs: [component(26)] });
    assert.equal(land(world, ['26']), 0);
    assert.equal(called(world, 'markReady').length, 1);
    const [merge] = called(world, 'mergePr');
    assert.equal(merge[1], 26);
    assert.equal(merge[2].sha, component(26).headRefOid, 'it merges the head its own CI measured');
    assert.equal(merge[2].method, 'merge');
    assert.equal(called(world, 'openPr').length, 0, 'no train ran');
    assert.equal(called(world, 'addLabel').length, 0, 'it never joined the queue');
    assert.equal(world.locks.has(LOCK_REF), false);
    assert.ok(world.out.some((line) => /PR #26 merged on the fast path/.test(line)));
  });

  it('waits for the run already going on a ready pull request without asking for another', () => {
    const running = REQUIRED_CONTEXTS.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:01:00Z' }));
    const world = fakeWorld({ prs: [component(27, { isDraft: false, statusCheckRollup: running, ownCiPolls: 0 })] });
    assert.equal(land(world, ['27']), 0);
    assert.equal(called(world, 'markReady').length, 0);
    assert.equal(called(world, 'mergePr')[0][1], 27);
  });

  it('hands a red own run back to its author, unqueued and without a train', () => {
    const world = fakeWorld({ prs: [component(28)], ownCi: () => red(['MCP'], 4242) });
    assert.equal(land(world, ['28']), 1);
    assert.equal(called(world, 'mergePr').length, 0);
    assert.equal(called(world, 'addLabel').length, 0);
    assert.equal(called(world, 'openPr').length, 0);
    const text = world.out.join('\n');
    assert.match(text, /ERROR PR #28 is red on its own CI, again after one rerun of the failed jobs; nothing was queued/);
    assert.match(text, /ERROR {3}MCP FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/4242/);
  });

  it('hands back a ready pull request already red after its rerun, without waiting', () => {
    const world = fakeWorld({ prs: [component(29, { isDraft: false, statusCheckRollup: red(['Unit · Contract']) })] });
    world.deps.gh.readRunAttempt = () => 2;
    assert.equal(land(world, ['29']), 1);
    assert.equal(world.events.filter((e) => e === 'sleep').length, 0);
    assert.equal(called(world, 'addLabel').length, 0);
  });

  it('sends a red own run to the train when every failed context is named --flaky', () => {
    const flaky = 'Playwright (chromium 1/3)';
    const world = fakeWorld({ prs: [component(30)], ownCi: () => red([flaky]) });
    assert.equal(land(world, ['30', `--flaky=${flaky}`]), 0);
    assert.ok(world.out.some((line) => /red only on Playwright \(chromium 1\/3\), named as tolerated; the train reruns it/.test(line)));
    assert.equal(called(world, 'openPr').length, 1);
    assert.ok(world.out.some((line) => /PR #30 landed through a train/.test(line)));
  });

  it('checks main again under the fast lock and takes the train when it moved in between', () => {
    let moved = false;
    const world = fakeWorld({ prs: [component(36)], mainMoves: () => (moved ? ['src/change-36.ts'] : []) });
    const takeLock = world.deps.gh.takeLock;
    world.deps.gh.takeLock = (ref, ...rest) => {
      if (ref === FAST_LOCK_REF) moved = true;
      return takeLock(ref, ...rest);
    };
    assert.equal(land(world, ['36']), 0);
    assert.ok(world.out.some((line) => /now FAIL disjoint-from-main: main also changed src\/change-36.ts/.test(line)));
    assert.notEqual(called(world, 'mergePr')[0][1], 36, 'the train merged, not the pull request directly');
  });

  it('never merges directly a head behind main, even green and disjoint, and spends no run of its own', () => {
    const behind = (sha) => sha === component(37).headRefOid || sha === component(39).headRefOid;
    const world = fakeWorld({ prs: [component(37, { isDraft: false, statusCheckRollup: green() }), component(39)], behindMain: behind });
    assert.equal(land(world, ['37']), 0);
    assert.ok(world.out.some((line) => /FAIL contains-main: its head is behind origin\/main/.test(line)));
    assert.ok(called(world, 'mergePr').every(([, number]) => number !== 37), 'the train merged it, on the tree that lands');
    assert.ok(world.out.some((line) => /PR #37 landed through a train/.test(line)));
    assert.equal(land(world, ['39']), 0);
    assert.equal(called(world, 'markReady').length, 0, 'a draft behind main goes to the train without its own run');
  });

  it('takes the train when main moves on while its own CI runs, even into no file of its own', () => {
    let ready = false;
    const world = fakeWorld({ prs: [component(40)], behindMain: () => ready });
    const markReady = world.deps.gh.markReady;
    world.deps.gh.markReady = (number) => {
      ready = true;
      return markReady(number);
    };
    assert.equal(land(world, ['40']), 0);
    assert.ok(world.out.some((line) => /own CI is green, but it cannot merge directly/.test(line)));
    assert.ok(called(world, 'mergePr').every(([, number]) => number !== 40));
  });

  it('leaves a pull request already queued to the train instead of running its own CI', () => {
    const world = fakeWorld({ prs: [component(43)], queued: [43] });
    assert.equal(land(world, ['43']), 0);
    assert.ok(world.out.some((line) => /taking the train: it is already queued for a train/.test(line)));
    assert.equal(called(world, 'markReady').length, 0);
    assert.ok(world.out.some((line) => /PR #43 landed through a train/.test(line)));
  });

  it('conducts a queue nobody conducts instead of leaving it behind a direct merge', () => {
    const world = fakeWorld({ prs: [component(41), component(42)] });
    assert.equal(land(world, ['41', '--no-wait']), 0);
    assert.equal(land(world, ['42']), 0);
    assert.ok(world.out.some((line) => /taking the train: other pull requests are queued and nobody conducts them/.test(line)));
    assert.equal(world.pulls.get(41).state, 'CLOSED', '#41 landed through the train #42 conducted');
    assert.equal(world.pulls.get(41).labels.length, 0);

    const green42 = fakeWorld({ prs: [component(41), component(42, { isDraft: false, statusCheckRollup: green() })] });
    assert.equal(land(green42, ['41', '--no-wait']), 0);
    assert.equal(land(green42, ['42']), 0);
    assert.equal(called(green42, 'mergePr')[0][1], 42, '#42 merged directly');
    assert.ok(green42.out.some((line) => /conducting them before leaving/.test(line)));
    assert.equal(green42.pulls.get(41).state, 'CLOSED', 'and #41 did not stay queued with nobody conducting');
  });

  describe('a red own run gets one rerun of its failed jobs', () => {
    const flaky = 'Playwright (chromium 2/3)';

    it('reruns only the failed jobs once and merges when they pass on the same head', () => {
      const world = fakeWorld({ prs: [component(70)], ownCi: (n, reruns) => (reruns === 0 ? red([flaky], 501) : green()) });
      assert.equal(land(world, ['70']), 0);
      assert.deepEqual(called(world, 'rerunFailed').map(([, id]) => id), ['501']);
      assert.ok(world.out.some((line) => /PR #70 is red on Playwright \(chromium 2\/3\) at 70ccccccc; re-running only the failed jobs of run 501 once on the same head/.test(line)));
      assert.equal(called(world, 'mergePr')[0][1], 70);
    });

    it('hands it back after the one rerun fails too, never rerunning twice', () => {
      const world = fakeWorld({ prs: [component(71)], ownCi: () => red(['MCP'], 502) });
      assert.equal(land(world, ['71']), 1);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.ok(world.out.some((line) => /ERROR PR #71 is red on its own CI, again after one rerun of the failed jobs; nothing was queued/.test(line)));
    });

    it('reruns a pull request that is already red when the lander arrives, then waits for it', () => {
      const world = fakeWorld({
        prs: [component(72, { isDraft: false, statusCheckRollup: red([flaky], 503) })],
        ownCi: (n, reruns) => (reruns === 0 ? red([flaky], 503) : green()),
      });
      assert.equal(land(world, ['72']), 0);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.equal(called(world, 'markReady').length, 0);
      assert.equal(called(world, 'mergePr')[0][1], 72);
    });

    it('hands it back at once, naming the red contexts, when GitHub refuses the rerun', () => {
      const world = fakeWorld({ prs: [component(74)], ownCi: () => red(['MCP'], 505) });
      let asked = 0;
      world.deps.gh.rerunFailed = () => { asked += 1; return false; };
      assert.equal(land(world, ['74']), 1);
      assert.equal(asked, 1, 'a refused rerun is not asked for again on every read');
      const text = world.out.join('\n');
      assert.match(text, /ERROR PR #74 is red on its own CI and was not rerun \(GitHub refused to rerun run 505\); nothing was queued/);
      assert.match(text, /ERROR {3}MCP FAILURE https:\/\/github.com\/wlsdks\/ontology-atlas\/actions\/runs\/505/);
      assert.ok(world.events.filter((e) => e === 'sleep').length <= 2);
    });

    it('asks for the rerun only once every job of that run has finished', () => {
      let reads = 0;
      const going = { name: 'Playwright (chromium 5/5)', status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:00:00Z', detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/506/job/9' };
      const world = fakeWorld({
        prs: [component(75)],
        ownCi: (n, reruns) => {
          reads += 1;
          if (reruns > 0) return green();
          return reads < 3 ? [...red(['MCP'], 506), going] : red(['MCP'], 506);
        },
      });
      let askedWhileGoing = false;
      const rerun = world.deps.gh.rerunFailed;
      world.deps.gh.rerunFailed = (id) => {
        askedWhileGoing ||= world.pulls.get(75).statusCheckRollup.some((r) => r.status === 'IN_PROGRESS');
        return rerun(id);
      };
      assert.equal(land(world, ['75']), 0);
      assert.equal(askedWhileGoing, false);
      assert.equal(called(world, 'rerunFailed').length, 1);
    });

    it('never reruns a run that was only cancelled, and stops when nothing replaces it', () => {
      const cancelled = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'COMPLETED', conclusion: 'CANCELLED', startedAt: '2026-09-26T10:00:00Z', detailsUrl: 'https://github.com/wlsdks/ontology-atlas/actions/runs/509/job/1' }));
      const world = fakeWorld({ prs: [component(76)], ownCi: cancelled });
      assert.equal(land(world, ['76']), 1);
      assert.equal(called(world, 'rerunFailed').length, 0);
      assert.ok(world.out.some((line) => /stopped waiting for its own CI: its run on 76ccccccc was cancelled and nothing replaced it/.test(line)));
    });

    it('asks once per head even when the attempt still reads as the first', () => {
      const world = fakeWorld({ prs: [component(77)], ownCi: () => red(['MCP'], 510) });
      world.deps.gh.readRunAttempt = () => 1;
      assert.equal(land(world, ['77']), 1);
      assert.equal(called(world, 'rerunFailed').length, 1);
      assert.ok(world.out.some((line) => /again after one rerun of the failed jobs/.test(line)));
    });

    it('reruns nothing when any of the red runs was rerun already', () => {
      const rollup = REQUIRED_CONTEXTS.map((name) => ({
        name,
        status: 'COMPLETED',
        conclusion: name === 'MCP' || name === 'Unit · Contract' ? 'FAILURE' : 'SUCCESS',
        startedAt: '2026-09-26T10:00:00Z',
        detailsUrl: `https://github.com/wlsdks/ontology-atlas/actions/runs/${name === 'MCP' ? 507 : 508}/job/1`,
      }));
      const world = fakeWorld({ prs: [component(78, { isDraft: false, statusCheckRollup: rollup })] });
      world.deps.gh.readRunAttempt = (id) => (String(id) === '507' ? 2 : 1);
      assert.equal(land(world, ['78']), 1);
      assert.equal(called(world, 'rerunFailed').length, 0);
      assert.ok(world.out.some((line) => /was not rerun \(its run was rerun already\)/.test(line)));
    });

    it('hands a red pull request back with --no-wait instead of queueing it', () => {
      const world = fakeWorld({ prs: [component(79, { isDraft: false, statusCheckRollup: red(['MCP']) })] });
      assert.equal(land(world, ['79', '--no-wait']), 1);
      assert.equal(called(world, 'addLabel').length, 0);
      assert.equal(called(world, 'rerunFailed').length, 0);
    });

    it('does not rerun a run someone already reran, or one whose attempt it cannot read', () => {
      for (const attempt of [2, null]) {
        const world = fakeWorld({ prs: [component(73, { isDraft: false, statusCheckRollup: red([flaky], 504) })] });
        world.deps.gh.readRunAttempt = () => attempt;
        assert.equal(land(world, ['73']), 1, String(attempt));
        assert.equal(called(world, 'rerunFailed').length, 0, String(attempt));
      }
    });
  });

  it('reports a direct merge even when the queue behind it cannot be read', () => {
    const world = fakeWorld({ prs: [component(80, { isDraft: false, statusCheckRollup: green() })] });
    world.deps.gh.listQueue = () => { throw new Error('gh api graphql failed: rate limit exceeded'); };
    assert.equal(land(world, ['80']), 0);
    const merged = world.out.findIndex((line) => /PR #80 is merged/.test(line));
    const warned = world.out.findIndex((line) => /ERROR warning: PR #80 is merged, but the queue behind it could not be conducted \(.*rate limit exceeded\)/.test(line));
    assert.ok(merged >= 0 && warned > merged, 'the merge is reported first, the queue failure only warns');
  });

  describe('waiting for its own CI', () => {
    const running = () => REQUIRED_CONTEXTS.map((name) => ({ name, status: 'IN_PROGRESS', conclusion: '', startedAt: '2026-09-26T10:01:00Z' }));
    const sleeps = (world) => world.events.filter((e) => e === 'sleep').length;

    it('stops, unqueued, when GitHub refuses to mark the draft ready', () => {
      const world = fakeWorld({ prs: [component(60)] });
      world.deps.gh.markReady = () => false;
      assert.equal(land(world, ['60']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #60 stopped waiting for its own CI: GitHub refused to mark it ready/.test(line)));
      assert.equal(sleeps(world), 0);
      assert.equal(called(world, 'addLabel').length, 0);
    });

    it('stops at once, unqueued, when the pull request is closed meanwhile', () => {
      const world = fakeWorld({ prs: [component(61)], onOwnCiRead: (pr) => { pr.state = 'CLOSED'; } });
      assert.equal(land(world, ['61']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #61 stopped waiting for its own CI: it is closed now; nothing was queued/.test(line)));
      assert.equal(sleeps(world), 1);
      assert.equal(called(world, 'addLabel').length, 0, 'a stopped wait never falls through to the queue');
    });

    it('stops when the pull request is turned back into a draft, and merges nothing', () => {
      const world = fakeWorld({ prs: [component(62)], onOwnCiRead: (pr) => { pr.isDraft = true; } });
      assert.equal(land(world, ['62']), 1);
      assert.ok(world.out.some((line) => /it was turned back into a draft while its CI ran/.test(line)));
      assert.equal(called(world, 'mergePr').length, 0);
    });

    it('asks GitHub again only once when no run ever reports', () => {
      const world = fakeWorld({ prs: [component(63)], ownCi: () => [] });
      assert.equal(land(world, ['63', '--timeout-minutes=10']), 1);
      assert.equal(called(world, 'markDraft').length, 1);
      assert.ok(world.out.some((line) => /gave no verdict within 10 minutes/.test(line)));
    });

    it('gives up at the deadline without merging', () => {
      const world = fakeWorld({ prs: [component(64)], ownCi: running });
      assert.equal(land(world, ['64', '--timeout-minutes=2']), 1);
      assert.ok(world.out.some((line) => /ERROR PR #64 stopped waiting for its own CI: its CI gave no verdict within 2 minutes/.test(line)));
      assert.equal(called(world, 'mergePr').length, 0);
      assert.equal(called(world, 'addLabel').length, 0);
    });

    it('follows a push made while it waits and merges the new head', () => {
      const moved = 'f'.repeat(40);
      const world = fakeWorld({ prs: [component(65)], onOwnCiRead: (pr, reads) => { if (reads === 1) pr.headRefOid = moved; } });
      assert.equal(land(world, ['65']), 0);
      assert.ok(world.out.some((line) => /PR #65's head moved to fffffffff; waiting for that push's CI/.test(line)));
      assert.equal(called(world, 'mergePr')[0][2].sha, moved);
    });
  });

  it('takes the train when main moves into its files while its own CI runs', () => {
    let ready = false;
    const world = fakeWorld({ prs: [component(34)], mainMoves: () => (ready ? ['src/change-34.ts'] : []) });
    const markReady = world.deps.gh.markReady;
    world.deps.gh.markReady = (number) => {
      ready = true;
      return markReady(number);
    };
    assert.equal(land(world, ['34']), 0);
    assert.ok(world.out.some((line) => /FAIL disjoint-from-main: main also changed src\/change-34.ts/.test(line)));
    assert.ok(world.out.some((line) => /own CI is green, but it cannot merge directly; the train runs it on today's main/.test(line)));
    assert.equal(called(world, 'mergePr').length, 1, 'only the train merged');
    assert.notEqual(called(world, 'mergePr')[0][1], 34);
  });

  it('merges a green, disjoint pull request on the fast path without queueing it', () => {
    const world = fakeWorld({ prs: [component(22, { isDraft: false, statusCheckRollup: green() })] });
    assert.equal(land(world, ['22']), 0);
    const [merge] = called(world, 'mergePr');
    assert.equal(merge[1], 22);
    assert.equal(merge[2].sha, component(22).headRefOid);
    assert.equal(merge[2].title, 'feat: change 22 (#22)');
    assert.equal(merge[2].method, 'merge', 'the fast path must preserve original commits');
    assert.equal(called(world, 'addLabel').length, 0);
    assert.deepEqual(world.events.filter((e) => e.includes(FAST_LOCK_REF)), [`take ${FAST_LOCK_REF}`, `release ${FAST_LOCK_REF}`]);
    assert.equal(world.locks.has(LOCK_REF), false, 'the fast path never touched the train lock');
  });

  it('takes the train when a train in flight shares its files, and --no-wait leaves right after', () => {
    const trainLock = {
      pr: 1990, token: 'otherhost-1-1', holder: 'ada', host: 'otherhost', acquiredAt: '2026-09-26T09:59:00Z',
      leaseMinutes: LEASE_MINUTES, train: { pr: 1990, components: [5], files: ['src/change-23.ts'] },
    };
    const world = fakeWorld({ prs: [component(23, { isDraft: false, statusCheckRollup: green() })], lock: trainLock });
    assert.equal(land(world, ['23', '--no-wait']), 0);
    assert.ok(world.out.some((line) => /FAIL no-overlapping-train: the train in flight also changes src\/change-23.ts/.test(line)));
    assert.equal(called(world, 'mergePr').length, 0);
    assert.equal(called(world, 'addLabel').length, 1);
    assert.ok(world.out.some((line) => /landing now: train #1990/.test(line)));
  });

  it('says who must conduct when --no-wait finds nobody conducting', () => {
    const world = fakeWorld({ prs: [component(24)] });
    assert.equal(land(world, ['24', '--no-wait']), 0);
    assert.ok(world.out.some((line) => /pnpm pr:land --conduct/.test(line)));
    assert.equal(called(world, 'openPr').length, 0);
    assert.equal(called(world, 'markReady').length, 0, '--no-wait queues and leaves; it starts no run it will not wait for');
  });

  it('exits 1 when its pull request is ejected', () => {
    const world = fakeWorld({ prs: [component(25)], conflicts: new Set([25]) });
    assert.equal(land(world, ['25', '--no-fast']), 1);
    assert.ok(world.out.some((line) => /ERROR PR #25 was taken out of the queue/.test(line)));
  });

  it('plans without writing anything to GitHub', () => {
    const world = fakeWorld({
      prs: [component(31), component(32, { isDraft: false, statusCheckRollup: green() }), component(33), component(35, { files: ['src/moved.ts'] })],
      queued: [33],
      conflicts: new Set([35]),
      behindMain: (sha) => sha === component(35).headRefOid,
      readOnly: true,
    });
    assert.equal(land(world, ['--plan', '31', '32', '35']), 0);
    const text = world.out.join('\n');
    assert.match(text, /PR #31: fast path not eligible/);
    assert.match(text, /PR #31: would mark it ready and wait for its own CI, then merge directly if main has not moved/);
    assert.match(text, /PR #32: would merge now/);
    assert.match(text, /PR #35: would be queued/);
    assert.match(text, /next train \(2 of 2 queued\): chore\(merge\): #33 #35/);
    assert.match(text, /#35 feat\/change-35@35ccccccc: would conflict and be ejected/);
    assert.match(text, /\| feat: change 33 \(#33\)  \(Author 33\)/, 'the plan shows the commit main would get for each pull request');
    assert.match(text, /dry run: nothing was written to GitHub/);
    assert.deepEqual(world.calls.filter(([name]) => !['readPr'].includes(name)), [], 'plan made a write call');
  });

  it('plans the speculative train that would ride on the next one', () => {
    const world = fakeWorld({ prs: [component(51), component(52), component(53)], queued: [51, 52, 53], conflicts: new Set([53]), readOnly: true });
    assert.equal(land(world, ['--plan', '51', '--batch=1']), 0);
    const text = world.out.join('\n');
    assert.match(text, /train size 1 \(--batch\)/);
    assert.match(text, /next train \(1 of 3 queued\): chore\(merge\): #51 /);
    assert.match(text, /speculative train while its CI runs \(1\): chore\(merge\): #52 /);
    assert.match(text, /lands only if that train lands, discarded if it does not/);
    assert.match(text, /#52 feat\/change-52@52ccccccc: merges cleanly/);
    assert.deepEqual(world.calls.filter(([name]) => !['readPr'].includes(name)), [], 'plan made a write call');

    // With a train in flight, its riders are not planned again and the next train rides on it.
    const trainLock = {
      pr: 1990, token: 'otherhost-1-1', holder: 'ada', host: 'otherhost', acquiredAt: '2026-09-26T09:59:00Z',
      leaseMinutes: LEASE_MINUTES, train: { pr: 1990, components: [51], files: ['src/change-51.ts'] }, trains: [{ pr: 1990, components: [51], files: ['src/change-51.ts'] }],
    };
    const flying = fakeWorld({ prs: [component(51), component(52)], queued: [51, 52], lock: trainLock, readOnly: true });
    land(flying, ['--plan', '52', '--no-fast']);
    const flyingText = flying.out.join('\n');
    assert.match(flyingText, /1 train\(s\) in flight carrying #51; the trains below form after it, the first one speculating on it/);
    assert.match(flyingText, /next train \(1 of 1 queued\): chore\(merge\): #52 — feat: change 52\n.*from train #1990's head/);

    const sequential = fakeWorld({ prs: [component(51), component(52)], queued: [51, 52], readOnly: true });
    land(sequential, ['--plan', '51', '--batch=1', '--no-speculate']);
    assert.match(sequential.out.join('\n'), /no speculative train: --no-speculate/);
  });

  it('prints the queue, the train in flight and its CI', () => {
    const world = fakeWorld({ prs: [component(41), component(42)], queued: [41, 42] });
    assert.equal(land(world, ['--queue']), 0);
    const text = world.out.join('\n');
    assert.match(text, /landing now: nothing is landing/);
    assert.match(text, /1\. #41 queued 0 min/);
    assert.match(text, /pnpm pr:land --conduct/);
  });
});

describe('GitHub merge transport preserves history', () => {
  it('uses a SHA-pinned merge commit by default and refuses squash or rebase', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify({ merged: true, sha: 'merged' }); });
    const sha = 'a'.repeat(40);
    assert.equal(github.mergePr(11, { sha }).ok, true);
    assert.ok(calls[0].includes('merge_method=merge'));
    assert.ok(calls[0].includes(`sha=${sha}`));
    for (const method of ['squash', 'rebase']) {
      assert.equal(github.mergePr(11, { sha, method }).ok, false);
    }
    assert.equal(calls.length, 1, 'rewriting requests must not reach GitHub');
  });

  it('titles a train merge commit with what it carries when asked', () => {
    const calls = [];
    const github = createGithub('owner/repo', (args) => { calls.push(args); return JSON.stringify({ merged: true, sha: 'merged' }); });
    github.mergePr(11, { sha: 'a'.repeat(40), title: 'Merge #10: fix(map): keep focus', message: '#10 fix(map): keep focus' });
    assert.ok(calls[0].includes('commit_title=Merge #10: fix(map): keep focus'));
    assert.ok(calls[0].includes('commit_message=#10 fix(map): keep focus'));
  });
});

describe('train history', () => {
  const row = (number, title, headRefName) => ({ number, title, state: 'MERGED', headRefName, comments: [] });

  it('reads trains titled the new and the old way, and only train branches', () => {
    const searches = [];
    const results = {
      'chore(merge):': [row(20, 'chore(merge): #19 — fix: x', 'train/20261009T000000Z-19'), row(21, 'chore(merge): tidy', 'chore/tidy')],
      'chore(train): land': [row(10, 'chore(train): land #9', 'train/20260926T000000Z-9')],
    };
    const github = createGithub('owner/repo', (args) => {
      const search = args[args.indexOf('--search') + 1];
      searches.push(search);
      return JSON.stringify(results[Object.keys(results).find((key) => search.includes(key))] ?? []);
    });
    assert.deepEqual(github.listTrainHistory().map((pr) => pr.number), [20, 10]);
    assert.equal(searches.length, 2);
  });

  it('reports unknown history when either search cannot be read', () => {
    let call = 0;
    const github = createGithub('owner/repo', () => (call++ === 0 ? '[]' : undefined));
    assert.equal(github.listTrainHistory(), null);
  });
});

