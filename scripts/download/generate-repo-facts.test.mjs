import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCRIPT = path.resolve('scripts/download/generate-repo-facts.mjs');
const OUTPUT = 'src/views/download/model/repo-facts.generated.ts';

/** A scratch root whose `gh` prints the given repository payload. */
function run(payload) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-repo-facts-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(OUTPUT)), { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(payload))});\n`,
    { mode: 0o755 },
  );
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
  });
  const written = path.join(root, OUTPUT);
  const output = fs.existsSync(written) ? fs.readFileSync(written, 'utf8') : null;
  fs.rmSync(root, { recursive: true, force: true });
  return { status: result.status, stderr: result.stderr, output };
}

test('writes the counts GitHub returned with the day they were read', () => {
  const { status, output } = run({ stargazers_count: 156, forks_count: 23 });
  assert.equal(status, 0);
  assert.match(output, /stars: 156,\n {2}forks: 23,\n {2}readOn: '\d{4}-\d{2}-\d{2}',/);
});

test('writes nothing when a count is missing', () => {
  const { status, stderr, output } = run({ stargazers_count: 156 });
  assert.equal(status, 1);
  assert.match(stderr, /no usable fork count/);
  assert.equal(output, null);
});
