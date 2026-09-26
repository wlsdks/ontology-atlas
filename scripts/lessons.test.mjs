import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  LESSON_DIR, REVIEW_THRESHOLD, checkImmutableLessons, createLesson, createLessonStatus, main, parseLessonRecord,
  readLessons, selectLessons, summarize,
} from './lessons.mjs';
import { createRecord } from './new-record.mjs';

const LESSONS_SCRIPT = fileURLToPath(new URL('./lessons.mjs', import.meta.url));
const BODY = [
  '**Observed**: `pnpm checks:changed -- --run` passed while a sibling suite had 25 failures.',
  '**Cost**: one CI round.',
  '**Suspected cause**: path rules do not follow imports.',
  '**Proposed change**: script: also run the module-graph selection.',
].join('\n');

const fixture = (fn) => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-lessons-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
};
const lesson = (root, extra = {}) => createLesson({ root, kind: 'gate-gap', area: 'checks-changed', slug: 'sibling suite', body: BODY, date: '2026-09-20', ...extra });
const verdict = (root, id, status, extra = {}) => createLessonStatus({ root, lesson: id, status, body: `**Evidence**: reproduced on ${status === 'fixed' ? 'commit 213eff090' : 'a clean checkout'}.`, date: '2026-09-21', ...extra });
const quiet = (root, argv, now) => { const out = []; main(argv, { root, now, log: (text) => out.push(text) }); return out.join('\n'); };

test('a verdict is a new file and never edits the lesson', () => fixture((root) => {
  const reported = lesson(root);
  const before = readFileSync(join(root, reported.path), 'utf8');
  assert.throws(() => verdict(root, reported.id, 'fixed'), /reported cannot become fixed/);
  const verified = verdict(root, reported.id, 'verified');
  assert.throws(() => verdict(root, reported.id, 'fixed', { parents: [reported.id] }), /stale or incomplete parents/);
  assert.throws(() => createLessonStatus({ root, lesson: reported.id, status: 'fixed', body: '**Evidence**: done.', date: '2026-09-21' }), /cite the commit/);
  verdict(root, reported.id, 'fixed');
  assert.equal(readFileSync(join(root, reported.path), 'utf8'), before);
  const [composed] = readLessons(root);
  assert.equal(composed.current, 'fixed');
  assert.deepEqual(composed.history.map((item) => item.status), ['reported', 'verified', 'fixed']);
  assert.ok(composed.history.some((item) => item.id === verified.id));
  assert.equal(readdirSync(join(root, LESSON_DIR)).length, 3);
  assert.throws(() => createLessonStatus({ root, lesson: '12345678-1234-4123-8123-123456789abc', status: 'verified', body: '**Evidence**: x.' }), /unknown lesson/);
}));

test('concurrent writers never share a file and an id is created exactly once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'atlas-lessons-race-'));
  try {
    const writer = `import { createLesson } from ${JSON.stringify(LESSONS_SCRIPT)};
      createLesson({ root: process.argv[1], kind: 'process', area: 'race', slug: 'same subject', body: process.argv[2], date: '2026-09-20' });`;
    const runs = Array.from({ length: 8 }, () => new Promise((done, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', writer, root, BODY], { stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', (chunk) => { error += chunk; });
      child.on('exit', (code) => (code === 0 ? done() : reject(new Error(error))));
    }));
    await Promise.all(runs);
    const files = readdirSync(join(root, LESSON_DIR));
    assert.equal(files.length, 8);
    assert.equal(new Set(readLessons(root).map((item) => item.id)).size, 8);
    const id = '12345678-1234-4123-8123-123456789abc';
    lesson(root, { id });
    assert.throws(() => lesson(root, { id }), /EEXIST|duplicate record id/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('divergent worktrees merge without a Git conflict and must reconcile before landing', () => fixture((root) => {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  const base = lesson(root); git('add', '.'); git('commit', '-m', 'baseline');
  const start = git('rev-parse', 'HEAD');
  git('switch', '-c', 'left'); const left = verdict(root, base.id, 'verified'); git('add', '.'); git('commit', '-m', 'left');
  git('switch', '-c', 'right', start); const right = verdict(root, base.id, 'refuted'); git('add', '.'); git('commit', '-m', 'right');
  git('merge', '--no-edit', 'left');
  const [split] = readLessons(root);
  assert.equal(split.state, 'needs_reconciliation');
  assert.equal(split.current, null);
  assert.throws(() => main(['--check', '--base=main'], { root, log: () => {} }), /reconcile concurrent verdicts/);
  assert.throws(() => verdict(root, base.id, 'refuted', { parents: [right.id] }), /stale or incomplete/);
  verdict(root, base.id, 'refuted');
  assert.equal(readLessons(root)[0].current, 'refuted');
  assert.deepEqual(readLessons(root)[0].heads.length, 1);
  assert.equal(quiet(root, ['--check', '--base=main']).includes('1 lessons'), true);
  writeFileSync(join(root, base.path), readFileSync(join(root, base.path), 'utf8').replace('one CI round', 'no cost'));
  assert.throws(() => checkImmutableLessons(root, 'main'), /immutable/);
  git('restore', base.path);
  assert.ok(left.path);
  rmSync(join(root, base.path));
  assert.throws(() => checkImmutableLessons(root, 'main'), /immutable/);
}));

test('the template refuses malformed lessons and verdicts', () => {
  const id = '12345678-1234-4123-8123-123456789abc';
  const file = `${LESSON_DIR}/2026-09-20-subject-${id}.md`;
  const meta = (extra = '') => `---\nid: ${id}\ndate: 2026-09-20\nkind: mistake\nstatus: reported\nharness_area: git${extra}\n---\n`;
  assert.equal(parseLessonRecord(`${meta()}${BODY}\n`.replace(/\n/g, '\r\n'), file).proposal, 'script');
  const bad = [
    [`${meta()}${BODY.replace('**Cost**: one CI round.\n', '')}`, /fields/],
    [`${meta()}${BODY.replace('one CI round.', '')}`, /Cost is empty/],
    [`${meta()}${BODY.replace('script:', 'maybe')}`, /must start with one of/],
    [`${meta()}${BODY}\n${'**Observed**: again\n'.repeat(1)}${'x\n'.repeat(20)}`, /cap/],
    [`${meta().replace('status: reported', 'status: verified')}${BODY}`, /always reported/],
    [`${meta().replace('kind: mistake', 'kind: taste')}${BODY}`, /kind must be/],
    [`${meta().replace('harness_area: git', 'harness_area: Git Worktree')}${BODY}`, /harness_area/],
    [`${meta('\nextra: 1')}${BODY}`, /exactly/],
    [`${meta().replace('date: 2026-09-20', 'date: 2026-02-30')}${BODY}`, /calendar/],
    [`${meta()}preface\n${BODY}`, /before the first field/],
  ];
  for (const [raw, pattern] of bad) assert.throws(() => parseLessonRecord(raw, file), pattern);
  assert.throws(() => parseLessonRecord(`${meta()}${BODY}`, `${LESSON_DIR}/2026-09-19-subject-${id}.md`), /filename/);
  const status = (value, evidence) => `---\nid: ${id}\ndate: 2026-09-20\nlesson: ${id.replace('1234567', '7654321')}\nstatus: ${value}\nparents: ${id.replace('1234567', '7654321')}\n---\n${evidence}\n`;
  assert.throws(() => parseLessonRecord(status('fixed', '**Evidence**: done'), file), /cite the commit/);
  assert.equal(parseLessonRecord(status('fixed', '**Evidence**: landed in #1776'), file).status, 'fixed');
  assert.throws(() => parseLessonRecord(status('verified', '**Reason**: ok'), file), /Evidence/);
  assert.throws(() => parseLessonRecord(status('closed', '**Evidence**: ok'), file), /status must be/);
});

test('the reader lists open and unfixed lessons, filters, and asks for a review at the threshold', () => fixture((root) => {
  const first = lesson(root);
  verdict(root, first.id, 'verified');
  const efficiency = createLesson({ root, kind: 'tool-efficiency', area: 'e2e', slug: 'pixel transfer', body: BODY, date: '2026-09-11' });
  for (let index = 0; index < REVIEW_THRESHOLD - 1; index += 1) createLesson({ root, kind: 'process', area: 'git-worktree', slug: `open ${index}`, body: BODY, date: '2026-09-25' });
  const text = quiet(root, []);
  assert.match(text, /Open, not yet verified \(5\)/);
  assert.match(text, /Verified, not yet fixed \(1\)/);
  assert.match(text, /Recurring areas: git-worktree 4\n/);
  assert.match(text, /Review due: 5 open lessons/);
  const json = JSON.parse(quiet(root, ['--json', '--kind=tool-efficiency']));
  assert.deepEqual(json.lessons.map((item) => item.id), [efficiency.id]);
  const now = new Date('2026-09-26T12:00:00Z');
  assert.equal(selectLessons(readLessons(root), { since: '10d', now }).length, 5);
  assert.equal(selectLessons(readLessons(root), { since: '2026-09-21', now }).length, 4);
  assert.equal(summarize(selectLessons(readLessons(root), { status: 'verified' })).verified.length, 1);
  assert.equal(JSON.parse(quiet(root, ['--id=' + first.id.slice(0, 8)])).current, 'verified');
  for (const argv of [['--kind=taste'], ['--since=soon'], ['--json=1'], ['--area'], ['--base=main'], ['--check', '--kind=process'], ['--nope'], ['--json', '--json']]) {
    assert.throws(() => main(argv, { root, now, log: () => {} }));
  }
}));

test('an empty inventory fails the check instead of passing about nothing', () => fixture((root) => {
  assert.throws(() => main(['--check'], { root, log: () => {} }), /no lesson records/);
}));

test('record:new writes lessons and verdicts through the same template', () => fixture((root) => {
  const written = createRecord({ root, kind: 'lesson', type: 'mistake', area: 'git-worktree', slug: 'stash', body: BODY, date: '2026-09-20' });
  assert.match(written.path, /^docs\/records\/lessons\/2026-09-20-stash-/);
  const status = createRecord({ root, kind: 'lesson-status', lesson: written.id, status: 'verified', body: '**Evidence**: reproduced.', date: '2026-09-20' });
  assert.match(status.path, /^docs\/records\/lessons\/2026-09-20-verified-stash-/);
  assert.throws(() => createRecord({ root, kind: 'lesson', type: 'taste', area: 'x', slug: 'y', body: BODY, date: '2026-09-20' }), /kind must be/);
}));

test('the repository lessons compose and keep refuted ones', () => {
  const lessons = readLessons();
  assert.ok(lessons.length >= 6, 'the seeded lessons are present');
  assert.ok(lessons.every((item) => item.state === 'current'));
  assert.ok(lessons.some((item) => item.current === 'refuted'), 'a misdiagnosis is kept as refuted, not deleted');
});
