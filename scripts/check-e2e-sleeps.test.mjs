import assert from 'node:assert/strict';
import { test } from 'node:test';

import { unjustifiedSleeps } from './check-e2e-sleeps.mjs';

const diff = (lines) => ['diff --git a/tests/e2e/x.spec.ts b/tests/e2e/x.spec.ts', '--- a/tests/e2e/x.spec.ts', '+++ b/tests/e2e/x.spec.ts', ...lines].join('\n');

test('an added sleep is reported with its new line number', () => {
  const findings = unjustifiedSleeps(diff(['@@ -10,0 +11,2 @@', '+  await page.click("a");', '+  await page.waitForTimeout(700);']));
  assert.deepEqual(findings, [{ file: 'tests/e2e/x.spec.ts', line: 12, text: 'await page.waitForTimeout(700);' }]);
});

test('a measurement-window note on the line or the line above justifies it', () => {
  assert.deepEqual(unjustifiedSleeps(diff(['@@ -1,0 +1,1 @@', '+  await page.waitForTimeout(500); // measurement window: count frames'])), []);
  assert.deepEqual(unjustifiedSleeps(diff(['@@ -1,0 +1,2 @@', '+  // Measurement window: the idle gate must stay closed for 2 s.', '+  await page.waitForTimeout(2000);'])), []);
});

test('removed and unchanged sleeps are not this change\'s to answer for', () => {
  assert.deepEqual(unjustifiedSleeps(diff(['@@ -5,1 +5,0 @@', '-  await page.waitForTimeout(700);'])), []);
  assert.deepEqual(unjustifiedSleeps(''), []);
});

test('a note in another hunk does not justify a sleep', () => {
  const findings = unjustifiedSleeps(diff([
    '@@ -1,0 +1,1 @@', '+  // measurement window: elsewhere',
    '@@ -40,0 +41,1 @@', '+  await page.waitForTimeout(300);',
  ]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 41);
});
