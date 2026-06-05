import { describe, expect, it } from 'vitest';
import {
  looksLikeOmotCodexToml,
  looksLikeOmotMcpJson,
} from './use-local-vault';

describe('vault-local agent config validation', () => {
  it('requires .mcp.json to point at the opened vault folder when expectedVault is provided', () => {
    const config = JSON.stringify({
      mcpServers: {
        'ontology-atlas': {
          command: 'npx',
          args: ['-y', 'ontology-atlas-mcp'],
          env: { OATLAS_VAULT: '/Users/jinan/other-vault' },
        },
      },
    });

    expect(looksLikeOmotMcpJson(config)).toBe(true);
    expect(looksLikeOmotMcpJson(config, { expectedVault: '.' })).toBe(false);
  });

  it('accepts vault-local .mcp.json and Codex config using OATLAS_VAULT=.', () => {
    const mcpJson = JSON.stringify({
      mcpServers: {
        'ontology-atlas': {
          command: 'npx',
          args: ['-y', 'ontology-atlas-mcp'],
          env: { OATLAS_VAULT: '.' },
        },
      },
    });
    const codexToml = [
      '[mcp_servers.ontology-atlas]',
      'command = "npx"',
      'args = ["-y", "ontology-atlas-mcp"]',
      '',
      '[mcp_servers.ontology-atlas.env]',
      'OATLAS_VAULT = "."',
      '',
    ].join('\n');

    expect(looksLikeOmotMcpJson(mcpJson, { expectedVault: '.' })).toBe(true);
    expect(looksLikeOmotCodexToml(codexToml, { expectedVault: '.' })).toBe(true);
  });

  it('rejects stale vault-local Codex configs pointing at a different vault', () => {
    const codexToml = [
      '[mcp_servers.ontology-atlas]',
      'command = "npx"',
      'args = ["-y", "ontology-atlas-mcp"]',
      '',
      '[mcp_servers.ontology-atlas.env]',
      'OATLAS_VAULT = "/Users/jinan/other-vault"',
      '',
    ].join('\n');

    expect(looksLikeOmotCodexToml(codexToml)).toBe(true);
    expect(looksLikeOmotCodexToml(codexToml, { expectedVault: '.' })).toBe(false);
  });
});
