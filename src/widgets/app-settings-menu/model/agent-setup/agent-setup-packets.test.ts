import { describe, expect, it } from 'vitest';
import {
  buildAgentSetupCopyText,
  buildAgentSetupPacket,
  type AgentSetupCopyKey,
} from './agent-setup-packets';

const VAULT_PATH = '/Users/me/My Vault';

describe('buildAgentSetupPacket', () => {
  it('says the vault path came from the app only when it is known', () => {
    expect(buildAgentSetupPacket('notes', VAULT_PATH)).toContain(
      'came from the installed desktop app',
    );
    expect(buildAgentSetupPacket('notes')).toContain(
      'Replace every <absolute path...> placeholder',
    );
  });
});

describe('buildAgentSetupCopyText', () => {
  const keys: AgentSetupCopyKey[] = [
    'verifyPrompt',
    'setupPacket',
    'postChangeSync',
    'firstContactProof',
    'configTemplate',
    'codexTemplate',
    'codexMcpAddCommand',
  ];

  it('builds non-empty text for every chip', () => {
    for (const key of keys) {
      expect(buildAgentSetupCopyText(key, 'notes', VAULT_PATH).trim()).not.toBe('');
    }
  });

  it('fills the absolute vault path into the path-aware packets', () => {
    for (const key of ['setupPacket', 'firstContactProof'] as const) {
      expect(buildAgentSetupCopyText(key, 'notes', VAULT_PATH)).toContain(VAULT_PATH);
    }
  });

  it('keeps the two root templates free of the vault path', () => {
    expect(buildAgentSetupCopyText('configTemplate', 'notes', VAULT_PATH)).not.toContain(
      VAULT_PATH,
    );
    expect(buildAgentSetupCopyText('codexTemplate', 'notes', VAULT_PATH)).not.toContain(
      VAULT_PATH,
    );
  });

  it('hands an agent MCP calls and app steps, never a source-checkout command', () => {
    for (const key of keys) {
      expect(buildAgentSetupCopyText(key, 'notes', VAULT_PATH)).not.toMatch(
        /\$ATLAS|cli\/src\/index\.mjs/,
      );
    }
  });
});
