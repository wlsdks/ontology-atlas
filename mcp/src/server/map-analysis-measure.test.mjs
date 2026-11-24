/**
 * What a map analysis line costs a write: a relation write walks nothing, writes
 * close together share one walk of the code and one HEAD read, and the dirty flag
 * describes the connected folder alone.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createMapAnalysisRecorder } from '../vault/sidecar/map-analysis-log.mjs';
import { recordWriteInMapAnalysis } from './map-analysis-effect.mjs';
import { createMapAnalysisMeasure, MEASURE_REUSE_MS } from './map-analysis-measure.mjs';

const COMMIT = 'a'.repeat(40);

/** A measure over counted fakes: `survey` walks nothing and `git` answers a fixed HEAD. */
function countedMeasure(clock) {
  const work = { walks: 0, revParses: 0, statuses: 0 };
  const measure = createMapAnalysisMeasure({
    repoRoot: '/repo',
    vaultRoot: '/repo/atlas',
    grounded: true,
    now: () => clock.ms,
    survey: () => {
      work.walks += 1;
      return null;
    },
    git: (_root, args) => {
      if (args[0] === 'rev-parse') {
        work.revParses += 1;
        return Buffer.from(`/repo\n${COMMIT}\n`);
      }
      work.statuses += 1;
      return Buffer.from('');
    },
  });
  return { measure, work };
}

function recorderInMemory() {
  const io = { readTail: () => null, append: () => {}, replace: () => {} };
  return createMapAnalysisRecorder({ vaultRoot: '/unused', io, readPress: () => null });
}

test('a relation write walks the repository zero times', () => {
  const clock = { ms: Date.UTC(2026, 10, 24) };
  const { measure, work } = countedMeasure(clock);
  const recorder = recorderInMemory();
  const relationWrites = [
    ['add_relation', { from: 'capabilities/a', to: 'capabilities/b' }, { from: 'capabilities/a' }],
    ['add_relations', {}, { relations: [{ ok: true, from: 'capabilities/a' }] }],
    ['remove_relation', { from: 'capabilities/a' }, { from: 'capabilities/a' }],
    ['replace_relation', { from: 'capabilities/a' }, { from: 'capabilities/a' }],
  ];
  for (const [name, args, result] of relationWrites) {
    assert.equal(recordWriteInMapAnalysis({ recorder, measureShare: measure, name, args, result, agent: null }), true, name);
  }
  assert.deepEqual(work, { walks: 0, revParses: 0, statuses: 0 });
});

test('patches within the reuse window walk the code once and read HEAD once', () => {
  const clock = { ms: Date.UTC(2026, 10, 24) };
  const { measure, work } = countedMeasure(clock);
  const recorder = recorderInMemory();
  const patch = (slug) =>
    recordWriteInMapAnalysis({ recorder, measureShare: measure, name: 'patch_concept', args: { slug }, result: { slug }, agent: null });
  for (let index = 0; index < 8; index += 1) {
    patch(`capabilities/c${index}`);
    clock.ms += 2_000;
  }
  assert.deepEqual(work, { walks: 1, revParses: 1, statuses: 1 });
  clock.ms += MEASURE_REUSE_MS;
  patch('capabilities/later');
  assert.deepEqual(work, { walks: 2, revParses: 2, statuses: 2 }, 'a later write walks and asks git again');
});

/** A committed repository with the connected folder at `app/`, its vault at `app/atlas/`, and a sibling `other/`. */
function repositoryWithSibling(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-map-measure-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ['app/main.js', 'app/README.md', 'other/tool.js']) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    writeFileSync(join(root, file), 'export const one = 1;\n');
  }
  mkdirSync(join(root, 'app', 'atlas'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', 'commit', '-q', '-m', 'fixture'], { cwd: root });
  return root;
}

test('a change the walk does not collect shows in the dirty flag once the reuse window passes', (t) => {
  const root = repositoryWithSibling(t);
  const clock = { ms: Date.UTC(2026, 10, 24) };
  const measure = createMapAnalysisMeasure({ repoRoot: join(root, 'app'), vaultRoot: join(root, 'app', 'atlas'), grounded: true, survey: () => null, now: () => clock.ms });
  assert.equal(measure().sourceDirty, false);
  writeFileSync(join(root, 'app/README.md'), '# Changed\n');
  clock.ms += MEASURE_REUSE_MS;
  assert.equal(measure().sourceDirty, true);
});

test('the dirty flag describes the connected folder, not the rest of its repository', (t) => {
  const root = repositoryWithSibling(t);
  const dirty = () =>
    createMapAnalysisMeasure({ repoRoot: join(root, 'app'), vaultRoot: join(root, 'app', 'atlas'), grounded: true, survey: () => null })().sourceDirty;

  writeFileSync(join(root, 'other/tool.js'), 'export const two = 2;\n');
  writeFileSync(join(root, 'app', 'atlas', 'concept.md'), '# A concept\n');
  assert.equal(dirty(), false, 'a change beside the connected folder, or in its vault, is not a change to it');
  writeFileSync(join(root, 'app/main.js'), 'export const two = 2;\n');
  assert.equal(dirty(), true);
});
