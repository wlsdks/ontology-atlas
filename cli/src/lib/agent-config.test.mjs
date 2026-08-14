import assert from 'node:assert/strict';
import test from 'node:test';

import { parse as parseToml } from 'smol-toml';

import {
  repairCodexConfigText,
  repairMcpJsonText,
} from './agent-config.mjs';

const expectedJson = {
  mcpServers: {
    'ontology-atlas': { command: 'node', args: ['/atlas/mcp.js'], env: { OATLAS_VAULT: './vault-b' } },
  },
};
const expectedToml = [
  '[mcp_servers.ontology-atlas]',
  'command = "node"',
  'args = ["/atlas/mcp.js"]',
  '',
  '[mcp_servers.ontology-atlas.env]',
  'OATLAS_VAULT = "./vault-b"',
  'OATLAS_REPO_ROOT = "."',
  '',
].join('\n');

test('JSON repair rejects duplicate properties instead of normalizing away ambiguity', () => {
  const text = '{"mcpServers":{"ontology-atlas":{"command":"one"},"ontology-atlas":{"command":"two"}}}';
  assert.deepEqual(repairMcpJsonText(text, expectedJson), { ok: false });
});

test('TOML repair rejects syntax errors and semantic Atlas dotted definitions', () => {
  for (const text of [
    'broken = [',
    'mcp_servers.ontology-atlas.command = "node"\n',
  ]) {
    assert.deepEqual(repairCodexConfigText(text, expectedToml), { ok: false }, text);
  }
});

test('TOML repair normalizes an unambiguous quoted Atlas section and preserves unrelated sections', () => {
  const text = [
    '[mcp_servers.other]',
    'command = "other"',
    '',
    '[mcp_servers."ontology-atlas"]',
    'command = "old"',
    '',
    '[mcp_servers."ontology-atlas".env]',
    'OATLAS_VAULT = "./vault-a"',
    '',
  ].join('\n');
  const repaired = repairCodexConfigText(text, expectedToml);
  assert.equal(repaired.ok, true);
  const parsed = parseToml(repaired.text);
  assert.equal(parsed.mcp_servers.other.command, 'other');
  assert.equal(parsed.mcp_servers['ontology-atlas'].env.OATLAS_VAULT, './vault-b');
});

test('TOML repair accepts fully quoted table-key segments', () => {
  for (const quoted of [
    '["mcp_servers"."ontology-atlas"]\ncommand = "old"\n\n["mcp_servers"."ontology-atlas"."env"]\nOATLAS_VAULT = "./vault-a"\n',
    "['mcp_servers'.'ontology-atlas']\ncommand = \"old\"\n\n['mcp_servers'.'ontology-atlas'.'env']\nOATLAS_VAULT = \"./vault-a\"\n",
  ]) {
    const repaired = repairCodexConfigText(quoted, expectedToml);
    assert.equal(repaired.ok, true, quoted);
    assert.equal(parseToml(repaired.text).mcp_servers['ontology-atlas'].env.OATLAS_VAULT, './vault-b');
  }
});

test('TOML repair accepts whitespace around quoted dotted-key separators', () => {
  const text = [
    '[ "mcp_servers" . "ontology-atlas" ]',
    'command = "old"',
    '',
    '[ "mcp_servers" . "ontology-atlas" . "env" ]',
    'OATLAS_VAULT = "./vault-a"',
    '',
  ].join('\n');
  const repaired = repairCodexConfigText(text, expectedToml);
  assert.equal(repaired.ok, true);
  assert.equal(parseToml(repaired.text).mcp_servers['ontology-atlas'].env.OATLAS_VAULT, './vault-b');
});

test('TOML repair accepts whitespace around unquoted dotted-key separators', () => {
  const text = [
    '[ mcp_servers . ontology-atlas ]',
    'command = "old"',
    '',
    '[ mcp_servers . ontology-atlas . env ]',
    'OATLAS_VAULT = "./vault-a"',
    '',
  ].join('\n');
  const repaired = repairCodexConfigText(text, expectedToml);
  assert.equal(repaired.ok, true);
  const parsed = parseToml(repaired.text);
  assert.equal(parsed.mcp_servers['ontology-atlas'].env.OATLAS_VAULT, './vault-b');
});

test('TOML repair accepts a valid commented Atlas header and preserves unrelated sections', () => {
  const text = [
    '[mcp_servers.other]',
    'command = "other"',
    '',
    '[mcp_servers.ontology-atlas] # stale',
    'command = "old"',
    '',
    '[mcp_servers.ontology-atlas.env] # stale',
    'OATLAS_VAULT = "./vault-a"',
    '',
  ].join('\n');
  const repaired = repairCodexConfigText(text, expectedToml);
  assert.equal(repaired.ok, true);
  const parsed = parseToml(repaired.text);
  assert.equal(parsed.mcp_servers.other.command, 'other');
  assert.equal(parsed.mcp_servers['ontology-atlas'].env.OATLAS_VAULT, './vault-b');
});
