import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  assessMcpExactCaseSurvey,
  compareMcpContracts,
} from './verify-mcp-binary.mjs';

const MCP_VERSION = JSON.parse(fs.readFileSync(new URL('../../mcp/package.json', import.meta.url), 'utf8')).version;

const contractFixture = () => ({
  initialize: { serverInfo: { version: MCP_VERSION } },
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
