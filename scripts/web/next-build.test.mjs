import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSteps, runSteps } from './next-build.mjs';

const bins = { nextBin: 'next', tscEntry: 'tsc' };
const labels = (steps) => steps.map(([label]) => label);

test('a build checks types natively before next build, which then skips its own check', () => {
  const steps = buildSteps({ env: {}, ...bins });
  assert.deepEqual(labels(steps), ['next typegen', 'tsc --noEmit', 'next build']);
  assert.deepEqual(steps[2][2], { ATLAS_BUILD_SKIP_TYPECHECK: '1' });
});

test('the gate-backed skip flag skips both type checks', () => {
  assert.deepEqual(labels(buildSteps({ env: { ATLAS_BUILD_SKIP_TYPECHECK: '1' }, ...bins })), ['next build']);
});

test('a type error stops the build before next build runs', () => {
  const ran = [];
  const run = (argv) => {
    ran.push(argv.join(' '));
    return argv[0] === 'tsc' ? 2 : 0;
  };
  const status = runSteps(buildSteps({ env: {}, ...bins }), { env: {}, run });
  assert.equal(status, 2);
  assert.deepEqual(ran, ['next typegen', 'tsc --noEmit']);
});
