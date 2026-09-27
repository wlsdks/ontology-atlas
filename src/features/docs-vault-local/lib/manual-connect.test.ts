import { describe, expect, it } from 'vitest';

import {
  manualConnectConfig,
  manualSetupCommand,
  manualVerifyCommand,
  normalizeManualPath,
} from './manual-connect';

describe('normalizeManualPath checks shape only', () => {
  it('accepts an absolute path unchanged', () => {
    expect(normalizeManualPath('/Users/me/notes')).toEqual({
      ok: true,
      value: '/Users/me/notes',
      issue: null,
    });
  });

  it('treats an empty value as not filled yet rather than an error', () => {
    expect(normalizeManualPath('   ').issue).toBe('empty');
    expect(normalizeManualPath('').ok).toBe(false);
  });

  it('strips surrounding quotes', () => {
    expect(normalizeManualPath(`'/Users/me/my notes'`).value).toBe('/Users/me/my notes');
    expect(normalizeManualPath('"/Users/me/notes"').ok).toBe(true);
  });

  it('strips a trailing slash', () => {
    expect(normalizeManualPath('/Users/me/notes/').value).toBe('/Users/me/notes');
    expect(normalizeManualPath('/').value).toBe('/');
  });

  it('unescapes spaces from a terminal drag', () => {
    expect(normalizeManualPath('/Users/me/my\\ notes').value).toBe('/Users/me/my notes');
  });

  it('converts a dragged file:// URL to a path', () => {
    expect(normalizeManualPath('file:///Users/me/my%20notes').value).toBe('/Users/me/my notes');
  });

  it('rejects a home tilde because config files do not expand it', () => {
    expect(normalizeManualPath('~/notes')).toMatchObject({ ok: false, issue: 'tilde' });
  });

  it('rejects a relative path', () => {
    expect(normalizeManualPath('notes').issue).toBe('relative');
    expect(normalizeManualPath('./notes').issue).toBe('relative');
  });

  it('rejects multiple lines', () => {
    expect(normalizeManualPath('/a\n/b').issue).toBe('multiline');
  });

  it('accepts a Windows drive path', () => {
    expect(normalizeManualPath('C:\\Users\\me\\notes').ok).toBe(true);
    expect(normalizeManualPath('C:/Users/me/notes').ok).toBe(true);
  });
});

const INPUT = {
  vaultAbsolute: '/Users/me/notes',
  checkoutAbsolute: '/Users/me/ontology-atlas',
};

describe('manualConnectConfig per-client config', () => {
  it('gives Claude Code a .mcp.json stdio triple with absolute paths', () => {
    const config = manualConnectConfig('claude-code', INPUT);
    expect(config.file).toBe('.mcp.json');
    const parsed = JSON.parse(config.body);
    expect(parsed.mcpServers['ontology-atlas']).toEqual({
      command: 'node',
      args: ['/Users/me/ontology-atlas/mcp/src/index.js'],
      env: { OATLAS_VAULT: '/Users/me/notes' },
    });
  });

  it('takes each client config file location from AGENT_CLIENTS', () => {
    expect(manualConnectConfig('cursor', INPUT).file).toBe('.cursor/mcp.json');
    expect(manualConnectConfig('antigravity', INPUT).file).toBe('.agents/mcp_config.json');
    expect(manualConnectConfig('codex', INPUT).file).toBe('.codex/config.toml');
  });

  it('emits TOML only for Codex', () => {
    const config = manualConnectConfig('codex', INPUT);
    expect(config.body).toContain('[mcp_servers.ontology-atlas]');
    expect(config.body).toContain('OATLAS_VAULT = "/Users/me/notes"');
    expect(config.body).toContain('/Users/me/ontology-atlas/mcp/src/index.js');
  });

  it('leaves no placeholder in the config', () => {
    for (const client of ['claude-code', 'cursor', 'antigravity', 'codex'] as const) {
      expect(manualConnectConfig(client, INPUT).body).not.toMatch(/<|자리|placeholder/i);
    }
  });
});

describe('manualSetupCommand / manualVerifyCommand', () => {
  it('calls the checkout CLI by absolute path', () => {
    expect(manualSetupCommand(INPUT)).toBe(
      'node /Users/me/ontology-atlas/cli/src/index.mjs agent-setup /Users/me/notes --root /Users/me/notes --write',
    );
  });

  it('quotes a path containing spaces for the shell', () => {
    expect(
      manualSetupCommand({ ...INPUT, vaultAbsolute: '/Users/me/my notes' }),
    ).toContain(`'/Users/me/my notes'`);
  });

  it('uses mcp-verify as the verification command', () => {
    expect(manualVerifyCommand(INPUT)).toBe(
      'node /Users/me/ontology-atlas/cli/src/index.mjs mcp-verify /Users/me/notes --timeout-ms 15000',
    );
  });
});
