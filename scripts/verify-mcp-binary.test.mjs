import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.match(result.stderr, /compiled MCP binary is missing:/);
  assert.doesNotMatch(result.stderr, /Usage:/);
});
