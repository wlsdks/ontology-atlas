// A command `init` prints must **actually run when pasted**.
//
// Dogfooding, measured 2026-07-28: "Next steps" told the user to run
// `ontology-atlas list`, which gave `command not found` (exit 127). That name is
// not in any registry and never will be (`docs/DECISIONS.md` 2026-07-27). Stranger
// still, **the README the same `init` writes was correct** — the generated artifact
// and the generating tool's own guidance followed different rules.
//
// Why the check lives here: the existing `npm-channel-retired` contract scans
// **files** (markdown, YAML). This violation lives in **runtime stdout**, outside
// that gate's reach, so this runs the process and reads the characters it emits.

import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cliCommand, cliInvocation, shellQuoteIfNeeded } from './self-invocation.mjs';

const CLI_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'index.mjs',
);

/** Strips ANSI colour so only the characters are judged — the verdict is about the command, not the colour. */
function stripAnsi(text) {
  return text.replace(/\[[0-9;]*m/g, '');
}

test('cliInvocation 은 실행 가능한 자기 호출을 절대 경로로 준다', () => {
  const invocation = cliInvocation({ argv: ['/usr/bin/node', '/abs/cli/src/index.mjs'] });
  assert.equal(invocation, 'node /abs/cli/src/index.mjs');
});

test('공백 든 경로만 따옴표로 감싼다', () => {
  assert.equal(shellQuoteIfNeeded('/plain/path.mjs'), '/plain/path.mjs');
  assert.equal(shellQuoteIfNeeded('/with space/path.mjs'), "'/with space/path.mjs'");
});

test('argv 가 없으면 체크아웃 상대 경로로 물러선다', () => {
  assert.equal(cliInvocation({ argv: ['node'] }), 'node cli/src/index.mjs');
});

test('cliCommand 는 자기 호출 뒤에 하위 명령을 이어 붙인다', () => {
  // Whatever launched the process (the test runner's own file, here), the prefix is
  // `cliInvocation` with the arguments appended. Only that composition is asserted.
  assert.equal(cliCommand('list'), `${cliInvocation()} list`);
  assert.equal(cliCommand('add', 'capability'), `${cliInvocation()} add capability`);
});

// This is the exact reproduction of the defect — run the printed line **verbatim**
// and check that it succeeds.
test('init 이 안내하는 명령을 그대로 실행하면 실제로 돈다', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'oatlas-init-'));
  try {
    const stdout = stripAnsi(
      execFileSync(process.execPath, [CLI_ENTRY, 'init', 'vault'], { cwd: dir, encoding: 'utf8' }),
    );

    // No dead name may appear on a runnable line of the "Next steps" block.
    const nextSteps = stdout.slice(stdout.indexOf('Next steps:'));
    assert.equal(
      /(^|\s)ontology-atlas (list|validate|mcp-verify|add|find|analyze|bootstrap)/.test(nextSteps),
      false,
      `죽은 명령이 Next steps 에 남아 있다:\n${nextSteps}`,
    );

    // Extract the first suggested command from the output and run it as-is.
    const listLine = nextSteps
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith('list') || line.includes('index.mjs list'));
    assert.ok(listLine, `안내에서 list 명령 줄을 못 찾았다:\n${nextSteps}`);

    const command = listLine.split('#')[0].trim();
    const args = command.split(/\s+/).slice(1); // everything after `node`
    const listed = execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.match(stripAnsi(listed), /example-capability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
