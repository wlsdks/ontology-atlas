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
  assert.throws(() => readSourceEvidence(root, [...selectors, ...selectors.slice(0, 5)]), /between 1 and 16/);
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
  assert.throws(() => readSourceEvidence(root, []), /between 1 and 16/);
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
  writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const packet = readSourceEvidence(root, [{ path: 'logo.png', startLine: 1, maxLines: 1 }]);
  assert.equal(packet.rows[0].reason, 'unsupported_source_type');
  // A README is the project's own statement of purpose, so prose beside code is readable.
  writeFileSync(join(root, 'README.md'), '# Tool\n\nParses a command line.\n');
  const prose = readSourceEvidence(root, [{ path: 'README.md', startLine: 3, maxLines: 1 }]);
  assert.equal(prose.rows[0].status, 'read');
  assert.match(prose.rows[0].text ?? JSON.stringify(prose.rows[0]), /Parses a command line/);
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

test('outlines a whole file through the same reader, sharing its path and hash checks', () => {
  const root = fixture();
  mkdirSync(join(root, 'src'));
  const body = [
    'package command',
    '',
    'type Command struct {',
    '\tName string',
    '}',
    '',
    'func (c *Command) SuggestionsFor(typed string) []string {',
    '\treturn nil',
    '}',
  ].join('\n');
  writeFileSync(join(root, 'src', 'command.go'), `${body}\n`);
  const packet = readSourceEvidence(root, [{ path: 'src/command.go', mode: 'outline' }]);
  const row = packet.rows[0];
  assert.equal(row.status, 'outlined');
  assert.equal(row.mode, 'outline');
  assert.equal(row.language, 'go');
  assert.equal(row.fileLines, 9);
  assert.equal(row.truncated, false);
  assert.equal(row.requestComplete, true);
  assert.equal(row.declarationCount, 2);
  assert.deepEqual(row.declarations.map((entry) => [entry.line, entry.kind, entry.name]), [
    [3, 'struct', 'Command'],
    [7, 'method', 'Command.SuggestionsFor'],
  ]);
  // An outline is a map to the next read, not evidence: no text, no citation.
  assert.equal('text' in row, false);
  assert.equal('citation' in row, false);
  assert.equal(row.next, null);
  assert.match(row.sha256, /^[a-f0-9]{64}$/);
  assert.equal(packet.totalReturnedBytes, row.returnedBytes);
  // The returned hash is the one the following exact read replays with.
  const exact = readSourceEvidence(root, [
    { path: 'src/command.go', startLine: 7, maxLines: 1, expectedSha256: row.sha256 },
  ]).rows[0];
  assert.equal(exact.status, 'read');
  assert.equal(exact.text, 'func (c *Command) SuggestionsFor(typed string) []string {\n');
});

test('an outline refuses exactly what a line read refuses', () => {
  const root = fixture();
  writeFileSync(join(root, 'key.pem'), 'key\n');
  writeFileSync(join(root, 'safe.ts'), 'export const safe = true;\n');
  writeFileSync(join(root, 'large.ts'), Buffer.alloc(256 * 1024 + 1, 0x61));
  const packet = readSourceEvidence(root, [
    { path: 'key.pem', mode: 'outline' },
    { path: '../outside.ts', mode: 'outline' },
    { path: 'safe.ts', mode: 'outline', expectedSha256: '0'.repeat(64) },
    { path: 'large.ts', mode: 'outline' },
  ]);
  assert.deepEqual(packet.rows.map((row) => row.reason), [
    'sensitive_path', 'path_traversal', 'hash_mismatch', 'file_too_large',
  ]);
  assert.ok(packet.rows.every((row) => row.status === 'refused' && row.mode === 'outline'));
  assert.ok(packet.rows.every((row) => row.requestedRange === null && !('text' in row)));
});

test('an outline selector states a mode instead of a range, and the two do not mix', () => {
  const root = fixture();
  writeFileSync(join(root, 'a.py'), 'def a():\n    pass\n');
  assert.throws(
    () => readSourceEvidence(root, [{ path: 'a.py', mode: 'outline', startLine: 1 }]),
    /startLine does not apply to mode "outline"/,
  );
  assert.throws(
    () => readSourceEvidence(root, [{ path: 'a.py', mode: 'headings' }]),
    /mode must be "lines" or "outline"/,
  );
  assert.throws(
    () => readSourceEvidence(root, [{ path: 'a.py', mode: 'lines' }]),
    /startLine must be a positive safe integer/,
  );
  const row = readSourceEvidence(root, [{ path: 'a.py', mode: 'lines', startLine: 1, maxLines: 1 }]).rows[0];
  assert.equal(row.status, 'read');
  assert.equal(row.text, 'def a():\n');
});

test('an outline stays inside the byte budget and says when it was cut', () => {
  const root = fixture();
  const lines = [];
  for (let index = 0; index < 900; index += 1) lines.push(`def function_number_${index}():`, '    pass');
  writeFileSync(join(root, 'wide.py'), `${lines.join('\n')}\n`);
  const row = readSourceEvidence(root, [{ path: 'wide.py', mode: 'outline' }]).rows[0];
  assert.equal(row.status, 'outlined');
  assert.equal(row.truncated, true);
  assert.equal(row.requestComplete, false);
  assert.ok(row.returnedBytes <= 16 * 1024);
  assert.ok(row.declarationCount < 400);
  assert.equal(row.declarations[0].name, 'function_number_0');
});

test('an outline binds the source digest to the file it listed', () => {
  const repository = `sha256:${'a'.repeat(64)}`;
  const root = fixture();
  writeFileSync(join(root, 'a.py'), 'def a():\n    pass\n');
  const first = readSourceEvidence(root, [{ path: 'a.py', mode: 'outline' }]);
  writeFileSync(join(root, 'a.py'), 'def a():\n    pass\n\n\ndef b():\n    pass\n');
  const second = readSourceEvidence(root, [{ path: 'a.py', mode: 'outline' }]);
  assert.notEqual(composeSourceDigest(repository, first), composeSourceDigest(repository, second));
  assert.equal(composeSourceDigest(repository, first), composeSourceDigest(repository, first));
});

/*
 * A rule usually sits one call below the entry a builder reads. A symbol read
 * returns the declaration and the declared functions it calls, so the next read
 * follows the call by name instead of guessing a line range.
 */
test('a symbol read returns one declaration and names the callees it can follow', () => {
  const root = fixture();
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src', 'release.py'), [
    'class Release:',
    '    def ship(self, labels):',
    '        bump = decide_bump(labels)',
    '        return self.publish(bump)',
    '',
    '    def publish(self, bump):',
    '        return bump',
    '',
    'def unrelated():',
    '    return 0',
    '',
  ].join('\n'));
  writeFileSync(join(root, 'src', 'bump.py'), 'def decide_bump(labels):\n    return "major" if "breaking" in labels else "patch"\n');
  const [row] = readSourceEvidence(root, [{ path: 'src/release.py', symbol: 'Release.ship' }]).rows;
  assert.equal(row.status, 'read');
  assert.equal(row.symbol, 'Release.ship');
  assert.deepEqual(row.actualRange, { startLine: 2, endLine: 4 });
  assert.deepEqual(row.callees, [
    { name: 'decide_bump', path: 'src/bump.py', line: 1 },
    { name: 'publish', path: 'src/release.py', line: 6 },
  ]);
  assert.equal(row.next, null, 'a symbol read does not continue past its declaration');
  const [missing] = readSourceEvidence(root, [{ path: 'src/release.py', symbol: 'Release.cancel' }]).rows;
  assert.equal(missing.status, 'refused');
  assert.equal(missing.reason, 'symbol_not_found');
  assert.throws(() => readSourceEvidence(root, [{ path: 'src/release.py', symbol: 'ship', startLine: 1 }]), /startLine does not apply with symbol/);
  assert.throws(() => readSourceEvidence(root, [{ path: 'src/release.py', symbol: 'not a name' }]), /one declared name/);
});

test('a symbol read takes the implementation over typing overload stubs', () => {
  const root = fixture();
  writeFileSync(join(root, 'apply.py'), [
    'class Transform:',
    '    @overload',
    '    def forward(self, data: int) -> int: ...',
    '',
    '    def forward(self, data):',
    '        if gated_out(data):',
    '            return data',
    '        return data + 1',
    '',
    'def gated_out(data):',
    '    return data < 0',
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'apply.py', symbol: 'Transform.forward' }]).rows;
  assert.deepEqual(row.actualRange, { startLine: 5, endLine: 8 });
  assert.deepEqual(row.callees, [{ name: 'gated_out', path: 'apply.py', line: 10 }]);
});

/*
 * Depth comes from the tool: a symbol read returns, beside the body, the code
 * that decides what the body does. Two rules were once written backwards from a
 * body alone: a guard in the resolver the constructor builds, and a default in
 * the options builder the body calls.
 */
test('a symbol read returns the constructor guard and the callee default that decide its body', () => {
  const root = fixture();
  mkdirSync(join(root, 'streams'));
  writeFileSync(join(root, 'streams', 'controller.go'), [
    'package streams',
    '',
    'type Controller struct {',
    '\tresolver func(string) (string, error)',
    '}',
    '',
    'func (c *Controller) Verified(id string) (string, error) {',
    '\tname, err := c.resolver(id)',
    '\topts := newOptions()',
    '\treturn name, err',
    '}',
    '',
    'func NewStreamsController(allowPublic bool) *Controller {',
    '\tresolver := func(id string) (string, error) {',
    '\t\tif !allowPublic && !signed(id) {',
    '\t\t\treturn "", errPublic',
    '\t\t}',
    '\t\treturn id, nil',
    '\t}',
    '\treturn &Controller{resolver: resolver}',
    '}',
    '',
    'func newOptions() *Options {',
    '\treturn &Options{DisconnectOnFailure: true}',
    '}',
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'streams/controller.go', symbol: 'Controller.Verified' }]).rows;
  assert.equal(row.cite, 'streams/controller.go:L7-L11');
  const byRole = Object.fromEntries(row.context.map((part) => [part.symbol, part]));
  assert.equal(byRole.NewStreamsController.role, 'constructor');
  assert.equal(byRole.NewStreamsController.cite, 'streams/controller.go:L13-L21');
  assert.match(byRole.NewStreamsController.text, /if !allowPublic/);
  assert.equal(byRole.newOptions.role, 'callee');
  assert.match(byRole.newOptions.text, /DisconnectOnFailure: true/);
  assert.ok(row.returnedBytes >= Buffer.byteLength(row.text) + byRole.newOptions.text.length);
});

test('a symbol read with no condition shows the guard in its caller, or names the caller to read', () => {
  const root = fixture();
  writeFileSync(join(root, 'queue.py'), [
    'def drain(buffer):',
    '    buffer.clear()',
    '',
    '',
    'def put(buffer, item, max_length=300):',
    '    buffer.append(item)',
    '    if len(buffer) >= max_length:',
    '        drain(buffer)',
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'queue.py', symbol: 'drain' }]).rows;
  const caller = row.context.find((part) => part.role === 'caller');
  assert.equal(caller.symbol, 'put');
  assert.equal(caller.cite, 'queue.py:L5-L8');
  assert.match(caller.text, /max_length=300/);
  assert.equal(row.deciding, undefined);

  writeFileSync(join(root, 'many.py'), ['from queue import drain', '', ...[1, 2, 3].map((n) => `def caller_${n}(b):\n    drain(b)\n`)].join('\n'));
  const [wide] = readSourceEvidence(root, [{ path: 'queue.py', symbol: 'drain' }]).rows;
  assert.equal(wide.context.some((part) => part.role === 'caller'), false, 'four callers are too many to show');
  assert.match(wide.deciding, /This body holds no condition; the deciding condition is in its callers/);
  assert.match(wide.deciding, /Read it: \{"path":"[^"]+","symbol":"[^"]+"\}/);
});

test('context comes only from files a read selector could name', () => {
  const root = fixture();
  writeFileSync(join(root, 'ledger.py'), 'def settle(entry):\n    entry.close()\n');
  // A caller in a file whose name a selector refuses (a citation delimiter) is never opened.
  writeFileSync(join(root, 'batch#nightly.py'), 'from ledger import settle\n\n\ndef nightly(entries):\n    for entry in entries:\n        if entry.due:\n            settle(entry)\n');
  const [row] = readSourceEvidence(root, [{ path: 'ledger.py', symbol: 'settle' }]).rows;
  assert.equal(row.status, 'read');
  assert.deepEqual((row.context ?? []).filter((part) => part.path.includes('#')), []);
  assert.doesNotMatch(JSON.stringify(row), /entry\.due/);
});

test('the context a symbol read adds stays within 6 KiB, naming what it left out', () => {
  const root = fixture();
  const helper = (n) => [`def check_${n}(order):`, ...Array.from({ length: 50 }, (_, line) => `    if order.flag_${line} > ${line}: return ${n * 100 + line}  # rule ${line}`), '    return 0', '', ''].join('\n');
  writeFileSync(join(root, 'rules.py'), [
    ...Array.from({ length: 8 }, (_, n) => helper(n)),
    'def review(order):',
    ...Array.from({ length: 8 }, (_, n) => `    check_${n}(order)`),
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'rules.py', symbol: 'review' }]).rows;
  const contextBytes = row.context.reduce((sum, part) => sum + Buffer.byteLength(part.text, 'utf8'), 0);
  assert.ok(contextBytes > 0 && contextBytes <= 6144, `context held ${contextBytes} bytes`);
  assert.ok(row.contextOmitted.length > 0, 'the callees that did not fit are named');
});

/*
 * One call deeper. Six questions a build could not answer had their rule one
 * call below the function a builder read: in an implementation behind a field's
 * interface, in an override of a method the base calls, behind a lazy accessor,
 * or in a named constant. A symbol read now serves those lines itself.
 */
test('a field call lists the implementations it may reach, and serves the one that refuses', () => {
  const root = fixture();
  mkdirSync(join(root, 'service'));
  mkdirSync(join(root, 'store'));
  writeFileSync(join(root, 'service', 'service.go'), [
    'package service',
    '',
    'func (s *Service) Find(key string) error {',
    '\tinfo, err := s.store.Lookup(key)',
    '\treturn send(info, err)',
    '}',
    '',
  ].join('\n'));
  writeFileSync(join(root, 'store', 'memory.go'), 'package store\n\nfunc (m *Memory) Lookup(key string) (*Info, error) {\n\treturn m.rows[key], nil\n}\n');
  writeFileSync(join(root, 'store', 'null.go'), 'package store\n\nfunc (NullStore) Lookup(key string) (*Info, error) {\n\treturn nil, errors.New("lookup not supported")\n}\n');
  writeFileSync(join(root, 'store', 'remote.go'), 'package store\n\nfunc (r *Remote) Lookup(key string) (*Info, error) {\n\treturn nil, errors.New("lookup not supported")\n}\n');
  const [row] = readSourceEvidence(root, [{ path: 'service/service.go', symbol: 'Service.Find' }]).rows;
  assert.deepEqual(row.callees.filter((callee) => callee.name === 'Lookup').map((callee) => [callee.path, callee.implementation]).sort(), [
    ['store/memory.go', true], ['store/null.go', true], ['store/remote.go', true],
  ]);
  const served = row.context.filter((part) => part.role === 'implementation').map((part) => part.symbol).sort();
  assert.deepEqual(served, ['NullStore.Lookup', 'Remote.Lookup'], 'only the implementations that decide are served');
  assert.match(row.context.find((part) => part.symbol === 'Remote.Lookup').text, /lookup not supported/);
});

test('a call on self reaches the override the owner inherits, not the base it replaces', () => {
  const root = fixture();
  writeFileSync(join(root, 'shape.py'), [
    'class Shape:',                                           // 1
    '    def _targets(self, batch):',                         // 2
    '        return batch.items',                             // 3
    '',                                                       // 4
    '',                                                       // 5
    'class FilledShape(Shape):',                              // 6
    '    def _targets(self, batch):',                         // 7
    '        if self.only is not None:',                      // 8
    '            return [i for i in batch.items if i.filled]', // 9
    '        return [i for i in batch.items if i.filled]',    // 10
    '',
  ].join('\n'));
  writeFileSync(join(root, 'crop.py'), 'def _targets(batch):\n    return batch\n');
  writeFileSync(join(root, 'square.py'), [
    'from shape import FilledShape',
    '',
    '',
    'class Square(FilledShape):',
    '    def measure(self, batch):',
    '        return {name: 1 for name in self._targets(batch)}',
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'square.py', symbol: 'Square.measure' }]).rows;
  assert.deepEqual(row.callees, [{ name: '_targets', path: 'shape.py', line: 7 }]);
  assert.equal(row.context.find((part) => part.role === 'callee')?.cite, 'shape.py:L7-L10');
});

test('a method of a field is never the owner\'s own method of the same name', () => {
  const root = fixture();
  writeFileSync(join(root, 'releaser.ts'), [
    'export class Releaser {',
    '  async comment() {',
    '    this.logger.verbose.info("commenting");',
    '    return this.check();',
    '  }',
    '',
    '  async info() {',
    '    return 1;',
    '  }',
    '',
    '  check() {',
    '    return 2;',
    '  }',
    '}',
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'releaser.ts', symbol: 'Releaser.comment' }]).rows;
  assert.deepEqual(row.callees, [{ name: 'check', path: 'releaser.ts', line: 11 }], 'the logger\'s info is not the info command');
});

test('a symbol read serves the rule one call deeper, through an accessor, and names the call it came through', () => {
  const root = fixture();
  mkdirSync(join(root, 'app'));
  writeFileSync(join(root, 'app', 'app.go'), [
    'package app',                                              // 1
    '',                                                         // 2
    'func (a *App) start() error {',                           // 3
    '\thandler := a.newHandler()',                              // 4
    '\treturn serve(handler)',                                  // 5
    '}',                                                        // 6
    '',                                                         // 7
    'func (a *App) newHandler() Handler {',                    // 8
    '\thandler := base()',                                      // 9
    '\tif !a.Routes().Empty() {',                               // 10
    '\t\thandler = a.Routes()',                                 // 11
    '\t}',                                                      // 12
    '\treturn handler',                                         // 13
    '}',                                                        // 14
    '',                                                         // 15
    'func (a *App) Routes() *RouteTable {',                     // 16
    '\tif a.routes == nil {',                                   // 17
    '\t\ta.routes = a.defaultRoutes()',                         // 18
    '\t}',                                                      // 19
    '\treturn a.routes',                                        // 20
    '}',                                                        // 21
    '',                                                         // 22
    'func (a *App) defaultRoutes() *RouteTable {',             // 23
    '\ttable := NewRouteTable()',                               // 24
    '\tif a.config.Live.Enabled && a.config.Live.Secret != "" {', // 25
    '\t\ttable.Add("live", liveChannel())',                     // 26
    '\t}',                                                      // 27
    '\treturn table',                                           // 28
    '}',                                                        // 29
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'app/app.go', symbol: 'App.start' }]).rows;
  const deeper = row.context.find((part) => part.symbol === 'App.defaultRoutes');
  assert.ok(deeper, `defaultRoutes is served: ${row.context.map((part) => part.symbol).join(', ')}`);
  assert.equal(deeper.cite, 'app/app.go:L23-L29');
  assert.equal(deeper.via, 'App.Routes');
  assert.equal(row.context.find((part) => part.symbol === 'App.Routes')?.via, 'App.newHandler');
});

test('a symbol read serves the named constant its served code compares against', () => {
  const root = fixture();
  mkdirSync(join(root, 'client'));
  writeFileSync(join(root, 'client', 'resume.go'), [
    'package client',                                      // 1
    '',                                                 // 2
    'const (',                                          // 3
    '\tresumeHeader = "X-RESUME-ID"',                   // 4
    '\tresumeParam  = "rid"',                           // 5
    ')',                                                // 6
    '',                                                 // 7
    'func (c *Client) options(info *Info) []Option {',  // 8
    '\topts := []Option{}',                             // 9
    '\tif hval := info.Header(resumeHeader); hval != "" {', // 10
    '\t\topts = append(opts, restore(hval))',           // 11
    '\t}',                                              // 12
    '\treturn opts',                                    // 13
    '}',                                                // 14
    '',
  ].join('\n'));
  const [row] = readSourceEvidence(root, [{ path: 'client/resume.go', symbol: 'Client.options' }]).rows;
  const constant = row.context.find((part) => part.role === 'constant');
  assert.deepEqual([constant?.symbol, constant?.cite], ['resumeHeader', 'client/resume.go:L4-L4']);
  assert.equal(constant.text, '\tresumeHeader = "X-RESUME-ID"\n');
  assert.equal(row.context.some((part) => part.symbol === 'resumeParam'), false, 'a constant the code does not use is not served');
});

/*
 * When two callees do not both fit, the one the body branches on, or the one
 * that refuses, holds the rule more often than a long body with as many
 * conditions.
 */
test('a callee the body branches on, or one that refuses, ranks over a long one with as many conditions', () => {
  // `big` alone fits the 6 KiB a read adds; `big` and `small` together do not.
  const big = (count) => {
    const head = ['def big(order):', ...Array.from({ length: count }, (_, n) => `    if order.flag_${n}: pass`)];
    const pad = Array.from({ length: 50 }, (_, n) => `    total += order.amount_${String(n).padStart(2, '0')}  # `);
    const room = 6144 - 16 - Buffer.byteLength([...head, ...pad, '    return total', ''].join('\n'));
    const width = Math.floor(room / pad.length);
    return [...head, ...pad.map((line) => line + '.'.repeat(width)), '    return total', ''];
  };
  const cases = [
    ['condition', ['def small(order):', '    if order.x: return 1', '    if order.y: return 2', '    return 0', ''], ['    big(order)', '    if small(order):', '        return 1', '    return 0']],
    ['refusal', ['def small(order):', '    if order.x: return 1', '    if order.y:', '        raise ValueError("held")', '    return 0', ''], ['    big(order)', '    small(order)', '    return 0']],
  ];
  for (const [name, small, review] of cases) {
    const root = fixture();
    writeFileSync(join(root, 'rules.py'), [...big(3), '', ...small, '', 'def review(order):', ...review, ''].join('\n'));
    const [row] = readSourceEvidence(root, [{ path: 'rules.py', symbol: 'review' }]).rows;
    const served = row.context.map((part) => part.symbol);
    assert.deepEqual(served, ['small'], `${name}: ${served.join(', ')} served, ${JSON.stringify(row.contextOmitted)} omitted`);
  }
});
