import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { assessMcpExactCaseSurvey } from './verify-mcp-binary.mjs';

test('exact-case verifier rejects a breadth map that spells the README another way', () => {
  assert.deepEqual(assessMcpExactCaseSurvey('Breadth map of /r: 1 product units.\nreadme.md: Purpose.\n'), {
    ok: true,
    lowercaseAddresses: 1,
    uppercaseAddresses: 0,
  });
  assert.equal(assessMcpExactCaseSurvey('README.md: Purpose.\n').ok, false);
  assert.equal(assessMcpExactCaseSurvey('readme.md: a\nREADME.md: b\n').ok, false);
  assert.equal(assessMcpExactCaseSurvey('no readme line').ok, false);
});

test('parses inline binary and vault flags used by the Windows workflows', () => {
  const root = path.join(os.tmpdir(), 'atlas verifier path with spaces');
  const missingBinary = path.join(root, 'ontology-atlas-mcp.exe');
  const vault = path.join(root, 'vault');
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('scripts/packaging/verify-mcp-binary.mjs'),
      `--binary=${missingBinary}`,
      `--vault=${vault}`,
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 1);
  assert.ok(
    result.stderr.includes(`compiled MCP binary is missing: ${missingBinary}`),
    result.stderr,
  );
  assert.doesNotMatch(result.stderr, /Usage:/);
});

test('preserves the complete inline vault path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas verifier path with spaces-'));
  const binary = path.join(root, 'ontology-atlas-mcp.exe');
  const missingVault = path.join(root, 'missing vault');
  fs.writeFileSync(binary, 'not reached');

  try {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/packaging/verify-mcp-binary.mjs'),
        `--binary=${binary}`,
        `--vault=${missingVault}`,
      ],
      { encoding: 'utf8' },
    );

    assert.equal(result.status, 1);
    assert.ok(
      result.stderr.includes(`verification vault is missing: ${missingVault}`),
      result.stderr,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
