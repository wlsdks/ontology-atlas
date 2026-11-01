import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { FIELDS, TEMPLATE } from '../lib/records/decision-record-template.mjs';

const script = fileURLToPath(new URL('./check-decision-record.mjs', import.meta.url));

test('prints the populated decision template outside a git checkout', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-decision-template-'));
  try {
    const result = spawnSync(process.execPath, [script, '--', '--template'], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(FIELDS.length > 0);
    assert.equal(result.stdout.trim(), TEMPLATE.trim());
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('rejects unknown arguments even when the template is requested', () => {
  const result = spawnSync(process.execPath, [script, '--template', '--unknown'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--unknown/);
});
