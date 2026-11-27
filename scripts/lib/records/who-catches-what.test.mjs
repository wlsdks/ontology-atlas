import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  blameLineCounts,
  bodyBeforeTestPlan,
  changeKind,
  changeLabel,
  classifyCatch,
  conceptStatesFromVerdictCounts,
  correctedLineTier,
  introducingCommit,
  isFixSubject,
  parseZeroContextDiff,
  pullRequestNumberOf,
  seededSample,
} from './who-catches-what.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

function catchOf(texts, extra = {}) {
  return classifyCatch({
    texts,
    issues: [],
    mainRedThenGreen: false,
    owner: 'wlsdks',
    sharesFilesWithPullRequest: () => false,
    ...extra,
  }).caughtBy;
}

describe('which changes are fixes', () => {
  it('reads a fix title behind a merge prefix or a squash suffix, and nothing else', () => {
    assert.equal(isFixSubject('Merge #3963: fix(changes): count only merged work'), true);
    assert.equal(isFixSubject('fix: keep the share cell whole (#3785)'), true);
    assert.equal(isFixSubject('feat(map): a fix for nothing (#1)'), false);
    assert.equal(isFixSubject('fixture: rename (#2)'), false);
    assert.equal(pullRequestNumberOf('Merge #3963: fix(changes): x'), 3963);
    assert.equal(pullRequestNumberOf('fix: y (#3785)'), 3785);
    assert.equal(pullRequestNumberOf('fix: y'), null);
  });

  it('names a landing train by all its pull requests and reads the kind behind it', () => {
    assert.equal(changeLabel({ sha: SHA_A, subject: 'Merge #2641 #2636: refactor(docs-vault): split' }), '#2641 #2636');
    assert.equal(changeLabel({ sha: SHA_A, subject: 'chore: direct commit' }), 'aaaaaaaaaa');
    assert.equal(changeKind('Merge #2641 #2636: refactor(docs-vault): split'), 'refactor');
    assert.equal(changeKind('chore(release): prepare v2.7.7'), 'chore');
  });
});

describe('which lines a fix corrected', () => {
  const DIFF = [
    'diff --git a/src/map/camera.ts b/src/map/camera.ts',
    '--- a/src/map/camera.ts',
    '+++ b/src/map/camera.ts',
    '@@ -10,2 +10,3 @@ function rest()',
    '@@ -40 +41 @@',
    '@@ -55,0 +57,4 @@',
    'diff --git a/src/map/camera.test.ts b/src/map/camera.test.ts',
    '--- a/src/map/camera.test.ts',
    '+++ b/src/map/camera.test.ts',
    '@@ -3,1 +3,1 @@',
    'diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml',
    '--- a/pnpm-lock.yaml',
    '+++ b/pnpm-lock.yaml',
    '@@ -1,9 +1,9 @@',
    'diff --git a/src/new.ts b/src/new.ts',
    '--- /dev/null',
    '+++ b/src/new.ts',
    '@@ -0,0 +1,5 @@',
  ].join('\n');

  it('keeps removed ranges and insertion points, and drops lockfiles and new files', () => {
    const files = parseZeroContextDiff(DIFF);
    assert.deepEqual(files.map((file) => file.oldPath), ['src/map/camera.ts', 'src/map/camera.test.ts']);
    assert.deepEqual(files[0].removed, [[10, 2], [40, 1]]);
    assert.deepEqual(files[0].insertedBelow, [55]);
  });

  it('takes removed code lines before tests, and insertion points only when nothing was removed', () => {
    assert.equal(correctedLineTier(parseZeroContextDiff(DIFF)).tier, 'code');
    const testOnly = parseZeroContextDiff(DIFF).filter((file) => file.oldPath.endsWith('.test.ts'));
    assert.deepEqual(correctedLineTier(testOnly), { tier: 'tests or documents', requests: [{ path: 'src/map/camera.test.ts', ranges: [[3, 1]] }] });
    const additionsOnly = parseZeroContextDiff(DIFF).map((file) => ({ ...file, removed: [] }));
    assert.deepEqual(correctedLineTier(additionsOnly), { tier: 'insertion point', requests: [{ path: 'src/map/camera.ts', ranges: [[55, 1]] }] });
    assert.deepEqual(correctedLineTier([]), { tier: null, requests: [] });
  });

  it('counts blamed lines per change and gives a tie to the most recent', () => {
    const porcelain = [`${SHA_A} 1 10 2`, 'author x', '\tline', `${SHA_A} 2 11`, '\tline', `${SHA_B} 7 40 1`, '\tline'].join('\n');
    const counts = blameLineCounts(porcelain);
    assert.deepEqual([...counts], [[SHA_A, 2], [SHA_B, 1]]);
    counts.set(SHA_B, 2);
    const times = { [SHA_A]: 100, [SHA_B]: 200 };
    assert.equal(introducingCommit(counts, (sha) => times[sha]).sha, SHA_B);
  });
});

describe('what caught the fault', () => {
  it('reads the body only up to its test plan', () => {
    assert.equal(bodyBeforeTestPlan('## Summary\nwhy\n## Test plan\n- review found nothing'), '## Summary\nwhy\n');
  });

  it('names a failing check as the gate, but not a new test that fails without the fix', () => {
    assert.equal(catchOf(['After #3694 merged, the clippy step went red on macOS.']), 'gate');
    assert.equal(catchOf(['main e2e is red: the overflow check failed at 1040.']), 'gate');
    assert.equal(catchOf(['The new test fails without this change.']), 'unknown');
    assert.equal(catchOf(['nothing said'], { mainRedThenGreen: true }), 'gate');
  });

  it('puts the owner and an outside report ahead of a gate', () => {
    assert.equal(catchOf(['The owner found the word unclear, and the lint failed too.']), 'person');
    assert.equal(catchOf(['The owner said (translated from Korean): "too dark"']), 'person');
    assert.equal(catchOf(['the build failed'], { issues: [{ author: 'someone-else' }] }), 'user');
    assert.equal(catchOf(['x'], { issues: [{ author: 'wlsdks' }] }), 'unknown');
  });

  it('separates an agent looking for faults from a find in unrelated work', () => {
    assert.equal(catchOf(['The security review found two more names.']), 'agent');
    assert.equal(catchOf(['Both gaps were found by the security review of #3756.']), 'agent');
    assert.equal(catchOf(['Noticed while drawing the rooms for #3835.']), 'luck');
    assert.equal(catchOf(['Noticed while drawing the rooms for #3835.'], { sharesFilesWithPullRequest: (n) => n === 3835 }), 'agent');
  });
});

describe('the hand-check sample', () => {
  it('draws the same distinct items for the same seed', () => {
    const items = Array.from({ length: 52 }, (_, i) => i);
    const first = seededSample(items, 20, 20261127);
    assert.deepEqual(seededSample(items, 20, 20261127), first);
    assert.equal(new Set(first).size, 20);
    assert.notDeepEqual(seededSample(items, 20, 1), first);
  });
});

describe('concept states', () => {
  it('folds a gone file into stale and keeps undated apart', () => {
    assert.deepEqual(conceptStatesFromVerdictCounts({ current: 35, stale: 50, missing: 9, unknown: 4 }), {
      checked: 35,
      stale: 59,
      notDated: 4,
      total: 98,
    });
  });
});
