// Bug sweep 2026-09-01: an unreadable file failed the run in text mode
// ("excluded from validation scope" → exit 1) but --json — exactly the mode CI
// consumes — exited 0, certifying files that were never opened. Text mode with
// warnings coexisting had the same gap through decideExit. Unreadable files are
// now fatal in every mode.
import assert from 'node:assert/strict';
import test from 'node:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runValidate } from './validate.mjs';

const UID = '00000000-0000-4000-8000-000000000001';
const UID2 = '00000000-0000-4000-8000-000000000002';

function makeVault() {
  const root = mkdtempSync(join(tmpdir(), 'oatlas-validate-exit-'));
  writeFileSync(
    join(root, 'a.md'),
    `---\nuid: ${UID}\nkind: domain\ntitle: A\n---\n\nbody\n`,
    'utf-8',
  );
  return root;
}

async function capture(run) {
  const outWrite = process.stdout.write;
  const errWrite = process.stderr.write;
  let stdout = '';
  process.stdout.write = (chunk) => {
    stdout += String(chunk);
    return true;
  };
  process.stderr.write = () => true;
  const origLog = console.log;
  console.log = (...parts) => {
    stdout += `${parts.join(' ')}\n`;
  };
  try {
    return { code: await run(), stdout };
  } finally {
    process.stdout.write = outWrite;
    process.stderr.write = errWrite;
    console.log = origLog;
  }
}

test('validate — a readable vault exits 0 in both modes (control)', async () => {
  const root = makeVault();
  try {
    assert.equal((await capture(() => runValidate([root]))).code, 0);
    assert.equal((await capture(() => runValidate([root, '--json']))).code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate — an unreadable file is fatal in --json mode too', async () => {
  const root = makeVault();
  const blocked = join(root, 'blocked.md');
  writeFileSync(blocked, `---\nuid: ${UID2}\nkind: domain\ntitle: B\n---\n`, 'utf-8');
  chmodSync(blocked, 0o000);
  try {
    const json = await capture(() => runValidate([root, '--json']));
    assert.equal(json.code, 1, 'json mode must not certify a file it never opened');
    const payload = JSON.parse(json.stdout);
    assert.equal(payload.unreadable.length, 1);

    const text = await capture(() => runValidate([root]));
    assert.equal(text.code, 1, 'text mode stays fatal as before');
  } finally {
    chmodSync(blocked, 0o644);
    rmSync(root, { recursive: true, force: true });
  }
});
