// A command `init` prints must run when pasted; `ontology-atlas` is in no registry (`docs/DECISIONS.md` 2026-07-27).
// This lives here because the `npm-channel-retired` contract scans files, and this violation lives in runtime stdout.

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

test('cliInvocation returns a runnable absolute self-invocation', () => {
  const invocation = cliInvocation({ argv: ['/usr/bin/node', '/abs/cli/src/index.mjs'] });
  assert.equal(invocation, 'node /abs/cli/src/index.mjs');
});

test('quotes only paths containing spaces', () => {
  assert.equal(shellQuoteIfNeeded('/plain/path.mjs'), '/plain/path.mjs');
  assert.equal(shellQuoteIfNeeded('/with space/path.mjs'), "'/with space/path.mjs'");
});

test('falls back to the checkout-relative path without argv', () => {
  assert.equal(cliInvocation({ argv: ['node'] }), 'node cli/src/index.mjs');
});

test('cliCommand appends the subcommand to the self-invocation', () => {
  // Whatever launched the process (the test runner's own file, here), the prefix is
  // `cliInvocation` with the arguments appended. Only that composition is asserted.
  assert.equal(cliCommand('list'), `${cliInvocation()} list`);
  assert.equal(cliCommand('add', 'capability'), `${cliInvocation()} add capability`);
});

// This is the exact reproduction of the defect — run the printed line **verbatim**
// and check that it succeeds.
test('the command init suggests runs as printed', () => {
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
      `Next steps still names a dead command:\n${nextSteps}`,
    );

    // Extract the first suggested command from the output and run it as-is.
    const listLine = nextSteps
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.endsWith('list') || line.includes('index.mjs list'));
    assert.ok(listLine, `no list command line in the next steps:\n${nextSteps}`);

    const command = listLine.split('#')[0].trim();
    const args = command.split(/\s+/).slice(1); // everything after `node`
    const listed = execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.match(stripAnsi(listed), /example-capability/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
