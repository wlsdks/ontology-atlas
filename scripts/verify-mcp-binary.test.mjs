import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('parses inline binary and vault flags used by the Windows workflows', () => {
  const root = path.join(os.tmpdir(), 'atlas verifier path with spaces');
  const missingBinary = path.join(root, 'ontology-atlas-mcp.exe');
  const vault = path.join(root, 'vault');
  const result = spawnSync(
    process.execPath,
    [
      path.resolve('scripts/verify-mcp-binary.mjs'),
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
        path.resolve('scripts/verify-mcp-binary.mjs'),
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
