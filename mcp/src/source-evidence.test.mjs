import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { composeSourceDigest, readSourceEvidence } from './source-evidence.mjs';

function fixture() {
  return mkdtempSync(join(tmpdir(), 'atlas-source-evidence-'));
}

test('returns exact complete CRLF and Unicode lines with a full-file hash continuation', () => {
  const root = fixture();
  writeFileSync(join(root, 'sample.ts'), Buffer.from('one\r\n둘\r\nthree\r\n'));
  const packet = readSourceEvidence(root, [{ path: 'sample.ts', startLine: 2, maxLines: 1 }]);
  const row = packet.rows[0];
  assert.equal(row.status, 'read');
  assert.equal(row.text, '둘\r\n');
  assert.deepEqual(row.actualRange, { startLine: 2, endLine: 2 });
  assert.equal(row.returnedBytes, 5);
  assert.equal(row.truncated, true);
  assert.deepEqual(row.next, { path: 'sample.ts', startLine: 3, maxLines: 1, expectedSha256: row.fullFileSha256 });
  assert.match(row.citation, /^source:sample\.ts#L2-L2@sha256:[a-f0-9]{64}$/);
});

test('preserves a UTF-8 BOM and CRLF as exact returned bytes', () => {
  const root = fixture();
  const original = Buffer.from('\ufeffconst value = "한글";\r\n');
  writeFileSync(join(root, 'bom.ts'), original);
  const row = readSourceEvidence(root, [{ path: 'bom.ts', startLine: 1, maxLines: 1 }]).rows[0];
  assert.equal(row.status, 'read');
  assert.deepEqual(Buffer.from(row.text, 'utf8'), original);
  assert.equal(row.returnedBytes, original.length);
});

test('preserves empty, beyond-EOF, oversized-line and aggregate outcomes explicitly', () => {
  const root = fixture();
  writeFileSync(join(root, 'empty.ts'), '');
  writeFileSync(join(root, 'huge.ts'), `${'x'.repeat(8193)}\n`);
  for (let index = 0; index < 5; index += 1) writeFileSync(join(root, `f${index}.ts`), `${'\\'.repeat(8100)}\n`);
  const packet = readSourceEvidence(root, [
    { path: 'empty.ts', startLine: 1, maxLines: 1 },
    { path: 'huge.ts', startLine: 1, maxLines: 1 },
    ...Array.from({ length: 5 }, (_, index) => ({ path: `f${index}.ts`, startLine: 1, maxLines: 1 })),
  ]);
  assert.equal(packet.rows[0].reason, 'range_beyond_eof');
  assert.equal(packet.rows[1].reason, 'line_too_large');
  assert.equal(packet.rows[1].next, null);
  assert.ok(packet.rows.some((row) => row.status === 'omitted' && row.reason === 'serialized_budget'));
  assert.ok(packet.serializedBytes <= 64 * 1024);
  assert.equal(packet.serializedBytes, Buffer.byteLength(JSON.stringify(packet)));
});

test('digest preserves legacy identity when omitted and binds selectors, files and refusal state when present', () => {
  const repository = `sha256:${'a'.repeat(64)}`;
  assert.equal(composeSourceDigest(repository), repository);
  const root = fixture();
  writeFileSync(join(root, 'a.ts'), 'a\n');
  const first = readSourceEvidence(root, [{ path: 'a.ts', startLine: 1, maxLines: 1 }]);
  const second = readSourceEvidence(root, [{ path: 'a.ts', startLine: 2, maxLines: 1 }]);
  assert.notEqual(composeSourceDigest(repository, first), composeSourceDigest(repository, second));
  writeFileSync(join(root, 'a.ts'), 'a\nchanged outside range\n');
  const changed = readSourceEvidence(root, [{ path: 'a.ts', startLine: 1, maxLines: 1 }]);
  assert.notEqual(composeSourceDigest(repository, first), composeSourceDigest(repository, changed));
});

test('rejects unsafe, ignored, sensitive, linked, binary, invalid UTF-8 and stale reads without bodies', () => {
  const root = fixture();
  mkdirSync(join(root, 'node_modules'));
  writeFileSync(join(root, 'node_modules', 'x.js'), 'secret');
  writeFileSync(join(root, '.env'), 'TOKEN=x');
  writeFileSync(join(root, 'key.pem'), 'key');
  writeFileSync(join(root, 'credentials.py'), 'API_KEY = "protected"\n');
  writeFileSync(join(root, 'binary.ts'), Buffer.from([0x61, 0, 0x62]));
  writeFileSync(join(root, 'bad.ts'), Buffer.from([0xc3, 0x28]));
  writeFileSync(join(root, 'safe.ts'), 'safe\n');
  symlinkSync(join(root, 'safe.ts'), join(root, 'link.ts'));
  const selectors = [
    '../outside.ts', '/tmp/outside.ts', 'C:\\outside.ts', '\\\\host\\share\\x.ts',
    'node_modules/x.js', '.env', 'key.pem', 'credentials.py', 'link.ts', 'binary.ts', 'bad.ts',
    { path: 'safe.ts', startLine: 1, maxLines: 1, expectedSha256: '0'.repeat(64) },
  ].map((row) => typeof row === 'string' ? { path: row, startLine: 1, maxLines: 1 } : row);
  assert.throws(() => readSourceEvidence(root, selectors), /between 1 and 8/);
  let credentialOpened = false;
  const packet = readSourceEvidence(root, selectors.slice(4), {
    onBeforeOpen: ({ target}) => { if (target.endsWith('credentials.py')) credentialOpened = true; },
  });
  assert.equal(packet.rows.length, 8);
  assert.ok(packet.rows.every((row) => row.status === 'refused'));
  assert.ok(packet.rows.every((row) => !('text' in row) && !('citation' in row)));
  assert.deepEqual(packet.rows.map((row) => row.reason), [
    'ignored_path', 'sensitive_path', 'sensitive_path', 'sensitive_path', 'symlink_path',
    'binary_source', 'invalid_utf8', 'hash_mismatch',
  ]);
  assert.equal(credentialOpened, false);
});

test('allows ordinary token and password-policy implementation filenames without claiming content secret detection', () => {
  const root = fixture();
  writeFileSync(join(root, 'token.ts'), 'export const issueToken = true;\n');
  writeFileSync(join(root, 'password-policy.py'), 'MIN_LENGTH = 12\n');
  const packet = readSourceEvidence(root, [
    { path: 'token.ts', startLine: 1, maxLines: 1 },
    { path: 'password-policy.py', startLine: 1, maxLines: 1 },
  ]);
  assert.deepEqual(packet.rows.map((row) => row.status), ['read', 'read']);
});

test('validates literal selectors and supported source types', () => {
  const root = fixture();
  writeFileSync(join(root, 'notes.txt'), 'no');
  assert.throws(() => readSourceEvidence(root, []), /between 1 and 8/);
  assert.throws(() => readSourceEvidence(root, [{ path: 'x.ts', startLine: 1, maxLines: 1, body: 'x' }]), /Unknown field/);
  assert.throws(
    () => readSourceEvidence(root, [{ path: `broken-${String.fromCharCode(0xd800)}.ts`, startLine: 1, maxLines: 1 }]),
    /well-formed Unicode/,
  );
  assert.equal(
    readSourceEvidence(root, [{ path: 'x.ts#L1', startLine: 1, maxLines: 1 }]).rows[0].reason,
    'ambiguous_citation_delimiter',
  );
  assert.equal(
    readSourceEvidence(root, [{ path: 'C:relative.ts', startLine: 1, maxLines: 1 }]).rows[0].reason,
    'ambiguous_separator',
  );
  const packet = readSourceEvidence(root, [{ path: 'notes.txt', startLine: 1, maxLines: 1 }]);
  assert.equal(packet.rows[0].reason, 'unsupported_source_type');
});

test('rejects absolute, drive, UNC, traversal, controls, symlink directories and directories', () => {
  const root = fixture();
  mkdirSync(join(root, 'real'));
  writeFileSync(join(root, 'real', 'x.ts'), 'x\n');
  symlinkSync(join(root, 'real'), join(root, 'linked'));
  mkdirSync(join(root, 'folder.ts'));
  const packet = readSourceEvidence(root, [
    { path: '/tmp/x.ts', startLine: 1, maxLines: 1 },
    { path: 'C:\\x.ts', startLine: 1, maxLines: 1 },
    { path: '\\\\host\\x.ts', startLine: 1, maxLines: 1 },
    { path: '../x.ts', startLine: 1, maxLines: 1 },
    { path: 'x\u0001.ts', startLine: 1, maxLines: 1 },
    { path: 'linked/x.ts', startLine: 1, maxLines: 1 },
    { path: 'folder.ts', startLine: 1, maxLines: 1 },
  ]);
  assert.deepEqual(packet.rows.map((row) => row.reason), [
    'absolute_path', 'absolute_path', 'absolute_path', 'path_traversal',
    'control_character', 'symlink_path', 'non_regular_file',
  ]);
});

test('enforces the actual file byte boundary and detects same-size named-path replacement', () => {
  const root = fixture();
  writeFileSync(join(root, 'limit.ts'), Buffer.alloc(256 * 1024, 0x61));
  assert.equal(readSourceEvidence(root, [{ path: 'limit.ts', startLine: 1, maxLines: 1 }]).rows[0].reason, 'line_too_large');
  writeFileSync(join(root, 'large.ts'), Buffer.alloc(256 * 1024 + 1, 0x61));
  assert.equal(readSourceEvidence(root, [{ path: 'large.ts', startLine: 1, maxLines: 1 }]).rows[0].reason, 'file_too_large');
  writeFileSync(join(root, 'race.ts'), 'old\n');
  const raced = readSourceEvidence(root, [{ path: 'race.ts', startLine: 1, maxLines: 1 }], {
    onDescriptorRead: ({ target }) => {
      writeFileSync(join(root, 'replacement.ts'), 'new\n');
      renameSync(join(root, 'replacement.ts'), target);
    },
  });
  assert.equal(raced.rows[0].reason, 'file_changed');
  assert.equal('text' in raced.rows[0], false);
});

test('refuses a POSIX FIFO before attempting a potentially blocking open', {
  skip: process.platform === 'win32' ? 'POSIX FIFO regression' : false,
}, () => {
  const root = fixture();
  execFileSync('/usr/bin/mkfifo', [join(root, 'pipe.py')]);
  let attemptedOpen = false;
  const packet = readSourceEvidence(root, [{ path: 'pipe.py', startLine: 1, maxLines: 1 }], {
    onBeforeOpen: () => { attemptedOpen = true; },
  });
  assert.equal(packet.rows[0].reason, 'non_regular_file');
  assert.equal(attemptedOpen, false);
});

test('rechecks every path component after read and refuses parent symlink reconfiguration', () => {
  const root = fixture();
  mkdirSync(join(root, 'parent'));
  writeFileSync(join(root, 'parent', 'code.py'), 'value = 1\n');
  const packet = readSourceEvidence(root, [{ path: 'parent/code.py', startLine: 1, maxLines: 1 }], {
    onDescriptorRead: () => {
      renameSync(join(root, 'parent'), join(root, 'moved'));
      symlinkSync(join(root, 'moved'), join(root, 'parent'));
    },
  });
  assert.equal(packet.rows[0].reason, 'file_changed');
  assert.equal('text' in packet.rows[0], false);
  assert.equal('citation' in packet.rows[0], false);
});
