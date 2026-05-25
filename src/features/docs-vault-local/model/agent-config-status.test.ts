import { describe, expect, it } from 'vitest';
import {
  looksLikeOmotCodexToml,
  looksLikeOmotMcpJson,
} from './use-local-vault';

describe('vault-local agent config validation', () => {
  it('requires .mcp.json to point at the opened vault folder when expectedVault is provided', () => {
    const config = JSON.stringify({
      mcpServers: {
        'oh-my-ontology': {
          command: 'npx',
          args: ['-y', 'oh-my-ontology-mcp'],
          env: { OMOT_VAULT: '/Users/jinan/other-vault' },
        },
      },
    });

    expect(looksLikeOmotMcpJson(config)).toBe(true);
    expect(looksLikeOmotMcpJson(config, { expectedVault: '.' })).toBe(false);
  });

  it('accepts vault-local .mcp.json and Codex config using OMOT_VAULT=.', () => {
    const mcpJson = JSON.stringify({
      mcpServers: {
        'oh-my-ontology': {
          command: 'npx',
          args: ['-y', 'oh-my-ontology-mcp'],
          env: { OMOT_VAULT: '.' },
        },
      },
    });
    const codexToml = [
      '[mcp_servers.oh-my-ontology]',
      'command = "npx"',
      'args = ["-y", "oh-my-ontology-mcp"]',
      '',
      '[mcp_servers.oh-my-ontology.env]',
      'OMOT_VAULT = "."',
      '',
    ].join('\n');

    expect(looksLikeOmotMcpJson(mcpJson, { expectedVault: '.' })).toBe(true);
    expect(looksLikeOmotCodexToml(codexToml, { expectedVault: '.' })).toBe(true);
  });

  it('rejects stale vault-local Codex configs pointing at a different vault', () => {
    const codexToml = [
      '[mcp_servers.oh-my-ontology]',
      'command = "npx"',
      'args = ["-y", "oh-my-ontology-mcp"]',
      '',
      '[mcp_servers.oh-my-ontology.env]',
      'OMOT_VAULT = "/Users/jinan/other-vault"',
      '',
    ].join('\n');

    expect(looksLikeOmotCodexToml(codexToml)).toBe(true);
    expect(looksLikeOmotCodexToml(codexToml, { expectedVault: '.' })).toBe(false);
  });
});
