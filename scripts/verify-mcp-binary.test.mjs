import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { compareMcpContracts } from './verify-mcp-binary.mjs';

const contractFixture = () => ({
  initialize: { serverInfo: { version: '0.13.0' } },
  tools: [
    {
      name: 'connection_info',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: { type: 'object', properties: { toolCount: { type: 'number' } } },
    },
  ],
  callResults: {
    3: { structuredContent: { toolCount: 35 } },
    4: { structuredContent: { kinds: [] } },
    5: { structuredContent: { errors: 0 } },
  },
});

test('source/bundled parity accepts exact first-contact contracts', () => {
  const source = contractFixture();
  const bundled = structuredClone(source);

  assert.deepEqual(compareMcpContracts(source, bundled), { ok: true, mismatches: [] });
});

test('source/bundled parity rejects schema drift instead of trusting tool count', () => {
  const source = contractFixture();
  const bundled = structuredClone(source);
  bundled.tools[0].inputSchema.additionalProperties = true;

  assert.deepEqual(compareMcpContracts(source, bundled), {
    ok: false,
    mismatches: ['tools/list schemas'],
  });
});

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
