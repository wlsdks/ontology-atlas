import { describe, expect, it } from 'vitest';
import {
  buildAgentSetupCliCommand,
  buildAgentSetupCopyText,
  buildAgentSetupPacket,
  buildAgentVerifyCliCommand,
  type AgentSetupCopyKey,
} from './agent-setup-packets';

const VAULT_PATH = '/Users/me/My Vault';

describe('buildAgentVerifyCliCommand', () => {
  it('targets the current folder when the vault path is unknown', () => {
    const lines = buildAgentVerifyCliCommand().split('\n');
    expect(lines[0]).toMatch(/^# export ATLAS=/);
    expect(lines[1]).toMatch(/ validate \.$/);
  });

  it('quotes a vault path with a space so the shell keeps it whole', () => {
    expect(buildAgentVerifyCliCommand(VAULT_PATH)).toContain(`validate '${VAULT_PATH}'`);
  });
});

describe('buildAgentSetupCliCommand', () => {
  it('asks for a state report in json mode and a repair in write mode', () => {
    expect(buildAgentSetupCliCommand('vault', 'json', VAULT_PATH)).toMatch(/ --json$/);
    expect(buildAgentSetupCliCommand('vault', 'write', VAULT_PATH)).toMatch(/ --write$/);
  });

  it('prints a fill-in placeholder, never a relative path, when the path is unknown', () => {
    expect(buildAgentSetupCliCommand('notes', 'json')).toContain(
      "'<absolute path to your notes folder>'",
    );
  });
});

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
    'verifyCli',
    'jsonGate',
    'postChangeSync',
    'firstContactProof',
    'configTemplate',
    'setupCheckCli',
    'setupCli',
    'codexTemplate',
    'codexMcpAddCommand',
  ];

  it('builds non-empty text for every chip', () => {
    for (const key of keys) {
      expect(buildAgentSetupCopyText(key, 'notes', VAULT_PATH).trim()).not.toBe('');
    }
  });

  it('fills the absolute vault path into the path-aware packets', () => {
    for (const key of ['setupPacket', 'verifyCli', 'firstContactProof', 'setupCli'] as const) {
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

  it('separates the repair command from the state check', () => {
    expect(buildAgentSetupCopyText('setupCheckCli', 'notes', null)).toMatch(/ --json$/);
    expect(buildAgentSetupCopyText('setupCli', 'notes', null)).toMatch(/ --write$/);
  });
});
