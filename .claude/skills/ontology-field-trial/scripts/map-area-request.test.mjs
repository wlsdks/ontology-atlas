import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { mapAreaPrompt } from '../../../../scripts/lib/benchmark/construction-prompts.mjs';

const script = fileURLToPath(new URL('./map-area-request.mjs', import.meta.url));
const checkout = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

/*
 * The headless chain sends request 1 from this entry; a call that cannot reach the
 * app's request text stops the chain before anything is sent.
 */
test('prompt prints the panel\'s request for the project note\'s figures, and exits 3 without them', (t) => {
  const vault = mkdtempSync(join(tmpdir(), 'atlas-map-area-request-'));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  const project = (uncertainty) => writeFileSync(join(vault, 'shop.md'), `---\nkind: project\ntitle: Shop\n---\nA shop.\n\n## Uncertainty\n\n${uncertainty}\n`);
  project('Not mapped yet: 3 of 5 areas, 30 of 40 abilities.\n- Not mapped yet: billing (12 of 12 abilities not on the map)');
  const printed = execFileSync(process.execPath, [script, 'prompt', checkout, vault], { encoding: 'utf8' });
  assert.equal(printed, mapAreaPrompt(checkout, { mapped: 10, total: 40, percent: 25 }));
  project('- None.');
  assert.equal(spawnSync(process.execPath, [script, 'prompt', checkout, vault]).status, 3);
});
