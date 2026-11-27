// A harness that cannot see a difference proves nothing. Each case here runs the real harness on one
// corpus case with the JavaScript server as A and, as B, the same server behind a proxy that plants
// exactly one difference (`support/planted-difference-server.mjs`), then asserts that the harness
// exits 1 and names the case and the place of the difference. A control run with nothing planted
// must exit 0, so a harness that fails everything does not pass either.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const harness = path.join(repoRoot, 'scripts', 'mcp', 'differential', 'differential.mjs');
const planter = path.join(here, 'support', 'planted-difference-server.mjs');

const workRoot = mkdtempSync(path.join(os.tmpdir(), 'oatlas-planted-'));
test.after(() => rmSync(workRoot, { recursive: true, force: true }));

function runHarness({ family, caseName, planted }) {
  const b = planted
    ? `cmd:${process.execPath} ${planter} ${Object.entries(planted).map(([k, v]) => `--${k}=${v}`).join(' ')}`
    : 'node';
  const result = spawnSync(
    process.execPath,
    [harness, `--family=${family}`, `--case=${caseName}`, '--a=node', `--b=${b}`, `--work-dir=${workRoot}`],
    { encoding: 'utf8', cwd: repoRoot, timeout: 120_000 },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

const PLANTED = [
  { kind: 'text byte', family: 'writes', caseName: 'add-concepts-single', planted: { kind: 'text-byte', id: '2' }, where: /result\.content\[0\]\.text/ },
  { kind: 'tool description character', family: 'shell', caseName: 'tools-list-profile-full', planted: { kind: 'description-char', id: '1' }, where: /description/ },
  { kind: 'key order', family: 'writes', caseName: 'add-concepts-single', planted: { kind: 'key-order', id: '1' }, where: /structuredContent/ },
  { kind: 'number formatting', family: 'vault-read', caseName: 'list-concepts-storefront', planted: { kind: 'number-format', id: '1' }, where: /structuredContent/ },
  { kind: 'missing field', family: 'writes', caseName: 'add-concepts-single', planted: { kind: 'missing-field', id: '1' }, where: /structuredContent/ },
  { kind: 'extra field', family: 'writes', caseName: 'add-concepts-single', planted: { kind: 'extra-field', id: '1' }, where: /structuredContent/ },
  { kind: 'error code', family: 'evidence', caseName: 'read-source-bytes', planted: { kind: 'error-code', id: '1' }, where: /errorCode/ },
  { kind: 'frontmatter key order in a written file', family: 'writes', caseName: 'add-concepts-single', planted: { kind: 'frontmatter-key-order', id: '4', file: 'capabilities/gift-wrap.md' }, where: /folder/ },
];

test('a run with nothing planted is equal', () => {
  const run = runHarness({ family: 'writes', caseName: 'add-concepts-single' });
  assert.equal(run.status, 0, run.output);
});

for (const entry of PLANTED) {
  test(`the harness reports a planted ${entry.kind} and exits 1`, () => {
    const run = runHarness(entry);
    assert.equal(run.status, 1, `expected exit 1\n${run.output}`);
    assert.match(run.output, new RegExp(`DIFFERENCE\\s+${entry.family}/${entry.caseName}`), run.output);
    assert.match(run.output, entry.where, run.output);
  });
}
