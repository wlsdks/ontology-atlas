import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { readSourceEvidence } from '../evidence-search/source-evidence.mjs';
import { measureBuildDepth, repositorySurvey } from './build-depth.mjs';
import { recordSourceEvidence, resetSessionReads, sessionReads } from './session-reads.mjs';
import { measureUnreadClaims, unreadClaimRefusal } from './unread-claims.mjs';

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-unread-claims-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const FILES = {
  'package.json': '{"name":"tool"}',
  'src/config.ts': 'export class Config {\n  loadConfig(path: string) {\n    if (!path) throw new Error("no path");\n    return path;\n  }\n}\nexport class Loader {\n  parse(text: string) {\n    type Row = { key: string };\n    return text as unknown as Row;\n  }\n  loadConfig(path: string) {\n    return path;\n  }\n}\n',
  'src/fees.ts': 'export function applyFee(x: number) {\n  if (x > 100) return x * 0.9;\n  return x;\n}\nexport function waiveFee(x: number) {\n  if (x < 0) return 0;\n  return x;\n}\n',
  'src/release.ts': 'export function publishRelease(tag: string) {\n  if (!tag) return null;\n  return tag;\n}\n',
  'src/legacy/release.ts': 'export function publishRelease(tag: string) {\n  return tag;\n}\n',
  'src/entry.ts': "import { applyFee } from './fees';\nexport function charge(x: number) {\n  if (x <= 0) return 0;\n  return applyFee(x);\n}\n",
  'svc/hub.go': 'package svc\n\ntype Hub struct{}\n\nfunc (h *Hub) AdmitClient(n int) bool {\n\tif n > 3 {\n\t\treturn false\n\t}\n\treturn true\n}\n',
  'py/io.py': 'def read_matrix(path):\n    if not path:\n        raise ValueError("no path")\n    return path\n',
};

const doc = (slug, frontmatter, body) => ({
  slug, frontmatter: { kind: slug.includes('/') ? slug.split('/')[0].replace(/ies$/, 'y').replace(/s$/, '') : 'project', ...frontmatter }, body,
});
const node = (slug, uncertainty, rest = '') => doc(slug, { path: 'src/entry.ts' }, `Charges an amount.\n${rest}\n## Uncertainty\n${uncertainty}\n`);

function withRepository(run) {
  resetSessionReads();
  const root = repository(FILES);
  try {
    return run(root, repositorySurvey(root, join(root, 'atlas')));
  } finally {
    resetSessionReads();
    rmSync(root, { recursive: true, force: true });
  }
}

const rows = (list) => list.map((row) => `${row.name} ${row.path}:L${row.line}`);
const read = (root, selectors) => recordSourceEvidence(root, readSourceEvidence(root, selectors));

/** The read call a message names, parsed back into the selectors it carries. */
function namedReads(message) {
  const call = /analyze_repo_structure\((\{.*?\})\)/.exec(message);
  assert.ok(call, `no read call in: ${message}`);
  return JSON.parse(call[1]).sourceReads;
}

test('a symbol a node says was not read is refused until the read the message names, then until the node says why', () => withRepository((root, repo) => {
  const docs = [
    node('capabilities/charge', '- `Config.loadConfig` search order not read.\n- Hub.AdmitClient was only outlined.\n- The `read_matrix` body was not opened.'),
  ];
  const before = measureUnreadClaims(docs, repo, sessionReads(root));
  assert.deepEqual(rows(before.toRead), ['read_matrix py/io.py:L1', 'Config.loadConfig src/config.ts:L2', 'Hub.AdmitClient svc/hub.go:L5']);
  const refusal = unreadClaimRefusal(before);
  assert.match(refusal, /^finalize_project_meaning blocked: 3 symbols the vault says were not read are in this repository/);
  assert.match(refusal, /Marking a competency row partial does not lift this/);

  // The repair is taken literally: exactly the reads it names, each by its declared owner.
  assert.deepEqual(namedReads(refusal), [
    { path: 'py/io.py', symbol: 'read_matrix' }, { path: 'src/config.ts', symbol: 'Config.loadConfig' }, { path: 'svc/hub.go', symbol: 'Hub.AdmitClient' },
  ]);
  read(root, namedReads(refusal));
  const afterRead = measureUnreadClaims(docs, repo, sessionReads(root));
  assert.deepEqual(afterRead.toRead, []);
  assert.deepEqual(rows(afterRead.toPatch), rows(before.toRead), 'read, the lines still say they were not');
  const patchMessage = unreadClaimRefusal(afterRead);
  assert.match(patchMessage, /keep one line under ## Uncertainty for that symbol alone that names it and says why it still cannot be read after "because"/);

  // Then the node, as the message asks: one symbol's line kept with its reason, the others written and dropped.
  const patched = [
    node('capabilities/charge', '- `Config.loadConfig` still cannot be read in full because its search order comes from plugins at run time.', '\nAdmits at most three clients (svc/hub.go:L6-L8).\n'),
  ];
  assert.equal(unreadClaimRefusal(measureUnreadClaims(patched, repo, sessionReads(root))), null);
}));

test('only a symbol read counts: a line read, a part another read served, or deleting the sentence does not', () => withRepository((root, survey) => {
  let repo = survey;
  const docs = [node('capabilities/charge', '- `applyFee` was not read.')];
  read(root, [{ path: 'src/fees.ts', symbol: 'waiveFee' }]);
  assert.deepEqual(rows(measureUnreadClaims(docs, repo, sessionReads(root)).toRead), ['applyFee src/fees.ts:L1'], 'a symbol read of another declaration in the file');
  read(root, [{ path: 'src/fees.ts', startLine: 1, maxLines: 4 }]);
  assert.deepEqual(rows(measureUnreadClaims(docs, repo, sessionReads(root)).toRead), ['applyFee src/fees.ts:L1'], 'a line read is not the symbol read');
  read(root, [{ path: 'src/entry.ts', symbol: 'charge' }]);
  assert.ok(sessionReads(root).get('src/fees.ts').some((range) => range.role === 'callee'), 'the fixture serves applyFee as a callee part');
  assert.deepEqual(rows(measureUnreadClaims(docs, repo, sessionReads(root)).toRead), ['applyFee src/fees.ts:L1'], 'a part another read served is not the symbol read');

  const deleted = [node('capabilities/charge', '- None.')];
  const owed = measureUnreadClaims(deleted, repo, sessionReads(root));
  assert.deepEqual(owed.toRead.map((row) => [row.name, row.slugs]), [['applyFee', []]], 'a line taken out still owes its read');
  assert.match(unreadClaimRefusal(owed), /said unread earlier this session/);
  writeFileSync(join(root, 'src', 'fees.ts'), 'export function waiveFee(x: number) {\n  if (x < 0) return 0;\n  return x;\n}\n');
  assert.deepEqual(measureUnreadClaims(deleted, repositorySurvey(root, join(root, 'atlas')), sessionReads(root)).toRead, [], 'a declaration that is gone owes nothing');
  writeFileSync(join(root, 'src', 'fees.ts'), FILES['src/fees.ts']);
  repo = repositorySurvey(root, join(root, 'atlas'));
  read(root, [{ path: 'src/fees.ts', symbol: 'applyFee' }]);
  assert.equal(unreadClaimRefusal(measureUnreadClaims(deleted, repo, sessionReads(root))), null);
}));

test('one line answers for one symbol, under ## Uncertainty, with a reason after "because"', () => withRepository((root, repo) => {
  read(root, [{ path: 'src/fees.ts', symbol: 'applyFee' }, { path: 'src/fees.ts', symbol: 'waiveFee' }]);
  const patch = (uncertainty, rest) => measureUnreadClaims([node('capabilities/charge', uncertainty, rest)], repo, sessionReads(root)).toPatch.map((row) => row.name);
  assert.deepEqual(patch('- `applyFee` and `waiveFee` were not read because the fee table loads at run time.'), ['applyFee', 'waiveFee'], 'one line for two symbols answers for neither');
  assert.deepEqual(patch('- `applyFee` was not read because the fee table loads at run time.\n- `waiveFee` was not read because waivers come from the billing service.'), []);
  assert.deepEqual(patch('- `applyFee` was not read.'), ['applyFee'], 'no reason');
  assert.deepEqual(patch('- `applyFee` was not read because tables.'), ['applyFee'], 'a reason is three words');
  assert.deepEqual(patch('- `applyFee` was not read: the fee table loads at run time.'), ['applyFee'], 'the reason the message asks for follows "because"');
  assert.deepEqual(patch('- None.', '\n`applyFee` was not read because the fee table loads at run time.\n'), ['applyFee'], 'a body line is not the ## Uncertainty line');
}));

test('a mention is no claim: prose words, names that were read, flags, fenced code, and a name declared twice', () => withRepository((root, repo) => {
  // Each line is measured on its own: the claims an earlier one raised are forgotten first.
  const claims = (uncertainty, extra = {}) => {
    resetSessionReads();
    const docs = [doc('capabilities/charge', { path: 'src/entry.ts', ...extra }, `Charges.\n\n## Uncertainty\n${uncertainty}\n`)];
    return measureUnreadClaims(docs, repo, sessionReads(root)).toRead.map((row) => `${row.name} ${row.path}${row.name.includes('.') ? `:L${row.line}` : ''}`);
  };
  assert.deepEqual(claims('- The fee table and release notes were not read.'), [], 'plain words name no symbol');
  assert.deepEqual(claims('- Members other than `applyFee` not read.'), [], 'the name after "other than" is the one that was read');
  assert.deepEqual(claims('- `applyFee` was read; the waiver path was not read.'), [], 'only the clause that says unread');
  assert.deepEqual(claims('- What `--fee/--waive` switch off was not read.'), [], 'a flag is no symbol');
  assert.deepEqual(claims('```\napplyFee not read\n```'), [], 'fenced code');
  assert.deepEqual(claims('- `applyFee` handles rounding.'), [], 'no unread wording');
  assert.deepEqual(claims('- `unknownThing` not read.'), [], 'a name declared nowhere');
  assert.deepEqual(claims('- `publishRelease` not read.'), [], 'a name declared twice names no one read');
  assert.deepEqual(claims('- `publishRelease` in `src/release.ts` not read.'), ['publishRelease src/release.ts'], 'the path its line gives picks one');
  assert.deepEqual(claims('- `publishRelease` not read.', { path: 'src/legacy/release.ts' }), ['publishRelease src/legacy/release.ts'], 'else the node\'s own file');
  assert.deepEqual(claims('- `Config.loadConfig` not read.'), ['Config.loadConfig src/config.ts:L2'], 'a method under its class');
  assert.deepEqual(claims('- `Loader.loadConfig` not read.'), ['Loader.loadConfig src/config.ts:L12'], 'the same name in the next class is that class\'s, past a type declared in a method body');
  assert.deepEqual(claims('- `loadConfig` not read.'), [], 'bare, it is declared twice');
  assert.deepEqual(claims('- The charge body was not read.'), [], 'a plain word that is also a function name');
  assert.deepEqual(claims('- `AdmitClient` was not read.'), ['AdmitClient svc/hub.go'], 'a Go method by its bare name');
  assert.deepEqual(claims('- applyFee and read_matrix bodies not read.'), ['read_matrix py/io.py', 'applyFee src/fees.ts'], 'a bare word shaped like code');
}));

test('the coverage line names the reads, and a repository-less or read-less measure holds nothing', () => withRepository((root, repo) => {
  const docs = [node('capabilities/charge', '- `applyFee` was not read.')];
  const depth = measureBuildDepth(docs, repo, sessionReads(root));
  assert.match(depth.line, /Unread: 1 symbol a node says was not read is declared .*applyFee \(src\/fees\.ts:L1, said unread in capabilities\/charge\)/);
  assert.match(depth.line, /analyze_repo_structure\(\{"sourceOnly":true,"sourceReads":\[\{"path":"src\/fees\.ts","symbol":"applyFee"\}\]\}\)/);
  assert.equal(measureUnreadClaims(docs, null, sessionReads(root)), null);
  assert.equal(measureUnreadClaims(docs, repo, null), null);
  assert.equal(unreadClaimRefusal(null), null);
}));
