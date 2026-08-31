import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASES,
  MODES,
  OUTPUT_SCHEMA,
  validateDefinitions,
  workflowScore,
} from './benchmark-change-flow.mjs';

test('change-flow definitions cover greenfield and brownfield commit tasks', () => {
  assert.deepEqual(CASES.map(({ id }) => id), ['greenfield', 'brownfield']);
  assert.deepEqual(MODES, ['off', 'on']);
  assert.deepEqual(validateDefinitions(), []);
  assert.ok(CASES.every(({ expectedFiles, ontologyFile, ontologyMarker, testCommand }) => expectedFiles.length === 2 && ontologyFile.startsWith('atlas/') && ontologyMarker.length > 0 && testCommand.length > 1));
});

test('workflow score keeps Git outcome dimensions separate', () => {
  const score = workflowScore({
    usable: true,
    workflowPass: true,
    integrity: { exactChangedFiles: true, testPassed: true, commitPassed: true, ontologyUpdatePassed: true },
    postMergeTest: { passed: true },
    merge: { mergePassed: true, mainPushPassed: true, cleanAfterCleanup: true },
  });
  assert.deepEqual(score, {
    usable: true,
    workflowPass: true,
    changedFilesExact: true,
    testsPassed: true,
    commitPassed: true,
    ontologyUpdatePassed: true,
    mergePassed: true,
    pushPassed: true,
    cleanupPassed: true,
  });
});

test('workflow score does not turn a failed merge into a pass', () => {
  const score = workflowScore({
    usable: true,
    workflowPass: false,
    integrity: { exactChangedFiles: true, testPassed: true, commitPassed: true, ontologyUpdatePassed: false },
    postMergeTest: { passed: true },
    merge: { mergePassed: false, mainPushPassed: false, cleanAfterCleanup: false },
  });
  assert.equal(score.workflowPass, false);
  assert.equal(score.mergePassed, false);
  assert.equal(score.pushPassed, false);
  assert.equal(score.ontologyUpdatePassed, false);
});

test('agent output schema requires an explicit Atlas action and unknowns', () => {
  assert.equal(OUTPUT_SCHEMA.additionalProperties, false);
  assert.deepEqual(OUTPUT_SCHEMA.required, ['summary', 'changedFiles', 'testCommand', 'commitSubject', 'atlasAction', 'unknowns']);
  assert.equal(OUTPUT_SCHEMA.properties.unknowns.type, 'array');
});
