import { describe, expect, it } from 'vitest';
import {
  looksLikeOmotCodexToml,
  looksLikeOmotMcpJson,
  readOmotCodexCommand,
} from './use-local-vault';

function mcpJson(command: string, args: string[], vault = '.'): string {
  return JSON.stringify({
    mcpServers: {
      'ontology-atlas': {
        command,
        args,
        env: { OATLAS_VAULT: vault },
      },
    },
  });
}

function codexToml(command: string, args: string[], vault = '.'): string {
  return [
    '[mcp_servers.ontology-atlas]',
    `command = ${JSON.stringify(command)}`,
    `args = ${JSON.stringify(args)}`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${JSON.stringify(vault)}`,
    '',
  ].join('\n');
}

describe('vault-local agent config validation', () => {
  const sourceEntrypoint = '/Users/dana/ontology-atlas/mcp/src/index.js';
  const bundledBinary =
    '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp';

  it('accepts the two executable distribution channels in JSON and TOML', () => {
    for (const [command, args] of [
      ['node', [sourceEntrypoint]],
      [bundledBinary, []],
    ] as const) {
      expect(looksLikeOmotMcpJson(mcpJson(command, [...args]), { expectedVault: '.' })).toBe(true);
      expect(looksLikeOmotCodexToml(codexToml(command, [...args]), { expectedVault: '.' })).toBe(true);
    }
  });

  it('rejects the retired npm launch even when its package name looks right', () => {
    const command = 'npx';
    const args = ['-y', 'ontology-atlas-mcp'];

    expect(looksLikeOmotMcpJson(mcpJson(command, args), { expectedVault: '.' })).toBe(false);
    expect(looksLikeOmotCodexToml(codexToml(command, args), { expectedVault: '.' })).toBe(false);
  });

  it('rejects arbitrary or incomplete launch shapes instead of matching a substring', () => {
    const invalidLaunches: Array<[string, string[]]> = [
      ['node', []],
      ['node', ['/tmp/not-atlas.js']],
      ['node', [sourceEntrypoint, '--extra']],
      ['/tmp/ontology-atlas-mcp-helper', []],
      [bundledBinary, ['--extra']],
    ];

    for (const [command, args] of invalidLaunches) {
      expect(looksLikeOmotMcpJson(mcpJson(command, args), { expectedVault: '.' })).toBe(false);
      expect(looksLikeOmotCodexToml(codexToml(command, args), { expectedVault: '.' })).toBe(false);
    }
  });

  it('requires the active config to point at the opened vault folder', () => {
    const json = mcpJson('node', [sourceEntrypoint], '/Users/dana/other-vault');
    const toml = codexToml('node', [sourceEntrypoint], '/Users/dana/other-vault');

    expect(looksLikeOmotMcpJson(json)).toBe(true);
    expect(looksLikeOmotMcpJson(json, { expectedVault: '.' })).toBe(false);
    expect(looksLikeOmotCodexToml(toml)).toBe(true);
    expect(looksLikeOmotCodexToml(toml, { expectedVault: '.' })).toBe(false);
  });

  it('extracts the command without mistaking it for current-vault validity', () => {
    const toml = codexToml(bundledBinary, [], '/Users/dana/other-vault');

    expect(readOmotCodexCommand(toml)).toBe(bundledBinary);
    expect(looksLikeOmotCodexToml(toml, { expectedVault: '.' })).toBe(false);
  });
});
