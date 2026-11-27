// A harness that cannot see a difference proves nothing. Each case here runs the real harness on one
// corpus case with the JavaScript server as A and, as B, the same server behind a proxy that plants
// exactly one difference (`support/planted-difference-server.mjs`), then asserts that the harness
// exits 1 and names the case and the place of the difference. A control run with nothing planted
// must exit 0, so a harness that fails everything does not pass either.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const plantedServer = (planted) =>
  `cmd:${process.execPath} ${planter} ${Object.entries(planted).map(([k, v]) => `--${k}=${v}`).join(' ')}`;

function runHarness({ family, caseName, planted, bothPlanted, corpusDir }) {
  const b = planted ? plantedServer(planted) : 'node';
  const a = bothPlanted ? b : 'node';
  const result = spawnSync(
    process.execPath,
    [
      harness,
      `--family=${family}`,
      `--case=${caseName}`,
      `--a=${a}`,
      `--b=${b}`,
      '--base-ref=',
      `--work-dir=${workRoot}`,
      ...(corpusDir ? [`--corpus-dir=${corpusDir}`] : []),
    ],
    { encoding: 'utf8', cwd: repoRoot, timeout: 120_000 },
  );
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

/** `writes/add-concepts-single` with a one-and-a-half-second wait for its first answer. */
function corpusWithShortWait() {
  const directory = path.join(workRoot, 'short-wait-corpus', 'writes');
  mkdirSync(directory, { recursive: true });
  const original = readFileSync(path.join(repoRoot, 'tests', 'differential', 'corpus', 'writes', 'add-concepts-single.jsonl'), 'utf8');
  const lines = original.split('\n').map((line) => {
    if (!line.startsWith('{"id":1,')) return line;
    return JSON.stringify({ ...JSON.parse(line), timeoutMs: 1500 });
  });
  writeFileSync(path.join(directory, 'add-concepts-single.jsonl'), lines.join('\n'));
  return path.dirname(directory);
}

const ADD = { family: 'writes', caseName: 'add-concepts-single' };

const PLANTED = [
  { kind: 'text byte', ...ADD, planted: { kind: 'text-byte', id: '2' }, where: /result\.content\[0\]\.text/ },
  { kind: 'tool description character', family: 'shell', caseName: 'tools-list-profile-full', planted: { kind: 'description-char', id: '1' }, where: /description/ },
  { kind: 'key order', ...ADD, planted: { kind: 'key-order', id: '1' }, where: /structuredContent/ },
  { kind: 'number formatting', family: 'vault-read', caseName: 'list-concepts-storefront', planted: { kind: 'number-format', id: '1' }, where: /structuredContent/ },
  { kind: 'missing field', ...ADD, planted: { kind: 'missing-field', id: '1' }, where: /structuredContent/ },
  { kind: 'extra field', ...ADD, planted: { kind: 'extra-field', id: '1' }, where: /structuredContent/ },
  { kind: 'error code', family: 'evidence', caseName: 'read-source-bytes', planted: { kind: 'error-code', id: '1' }, where: /errorCode/ },
  { kind: 'string escape that decodes to the same text', ...ADD, planted: { kind: 'string-escape', id: '2' }, where: /bytes/ },
  { kind: 'jsonrpc version', ...ADD, planted: { kind: 'jsonrpc-version', id: '1' }, where: /jsonrpc/ },
  { kind: 'id written as 1.0', ...ADD, planted: { kind: 'id-text', id: '1' }, where: /\bid\b/ },
  { kind: 'result and error together', ...ADD, planted: { kind: 'result-and-error', id: '1' }, where: /error/ },
  { kind: 'extra message from the server', ...ADD, planted: { kind: 'server-message', id: '1' }, where: /server-message/ },
  { kind: 'line of invalid UTF-8', ...ADD, planted: { kind: 'invalid-utf8', id: '1' }, where: /server-message/ },
  { kind: 'unterminated last line', ...ADD, planted: { kind: 'trailing-output', id: '1' }, where: /server-message/ },
  { kind: 'line on stderr', ...ADD, planted: { kind: 'stderr', id: '1' }, where: /stderr/ },
  { kind: 'exit code', ...ADD, planted: { kind: 'exit-code', id: '1' }, where: /exit/ },
  { kind: 'answer that never comes', ...ADD, planted: { kind: 'drop-answer', id: '1' }, where: /answer/, corpusDir: corpusWithShortWait },
  { kind: 'commit in the repository', family: 'writes', caseName: 'writes-on-miniature-repo-evidence-nodes', planted: { kind: 'repository-state', id: '1' }, where: /repository state/ },
  { kind: 'file time of a planted file', family: 'vault-read', caseName: 'list-concepts-storefront', planted: { kind: 'file-time', id: '1', file: 'capabilities/cart.md' }, where: /folder/ },
  { kind: 'file a hostile setting must not create', family: 'writes', caseName: 'git-snapshot-in-hostile-repo', planted: { kind: 'must-not-exist', id: '1', file: 'fsmonitor-ran.txt' }, where: /must-not-exist/ },
  { kind: 'write beside the case folder', ...ADD, planted: { kind: 'outside-write', id: '1' }, where: /outside-write/ },
  { kind: 'write in the home folder', ...ADD, planted: { kind: 'home-write', id: '1' }, where: /home:planted\.txt/ },
  { kind: 'frontmatter key order in a written file', ...ADD, planted: { kind: 'frontmatter-key-order', file: 'capabilities/gift-wrap.md' }, where: /folder/ },
  {
    kind: 'secret marker in an answer when both servers do it',
    ...ADD,
    planted: { kind: 'secret-leak', id: '1' },
    bothPlanted: true,
    where: /secret/,
  },
  {
    kind: 'reported file time that is another version\'s',
    family: 'writes',
    caseName: 'patch-concept-frontmatter-and-body',
    planted: { kind: 'stale-mtime', id: '3' },
    bothPlanted: true,
    where: /own-time/,
  },
];

test('a run with nothing planted is equal', () => {
  const run = runHarness(ADD);
  assert.equal(run.status, 0, run.output);
});

for (const entry of PLANTED) {
  test(`the harness reports a planted ${entry.kind} and exits 1`, () => {
    const run = runHarness({ ...entry, corpusDir: entry.corpusDir?.() });
    assert.equal(run.status, 1, `expected exit 1\n${run.output}`);
    assert.match(run.output, new RegExp(`DIFFERENCE\\s+${entry.family}/${entry.caseName}`), run.output);
    assert.match(run.output, entry.where, run.output);
  });
}
