import { describe, expect, it } from 'vitest';

import { authRepairOf, CODEX_LOGIN_COMMAND } from './auth-repair';
import { claudeLoginRepairCommand } from './claude-login-repair';

describe('authRepairOf', () => {
  it('keeps the keychain repair for Claude Code', () => {
    expect(authRepairOf('claude-acp')).toEqual({ tool: 'claude', command: claudeLoginRepairCommand() });
  });

  it('sends Codex to its own terminal sign-in, never the Claude keychain command', () => {
    const repair = authRepairOf('codex-acp');
    expect(repair).toEqual({ tool: 'codex', command: CODEX_LOGIN_COMMAND });
    expect(repair.command).toBe('codex login');
    expect(repair.command).not.toContain('security');
  });

  it('offers no command for a tool it does not know', () => {
    expect(authRepairOf('gemini-acp')).toEqual({ tool: 'other', command: null });
    expect(authRepairOf(null)).toEqual({ tool: 'other', command: null });
  });
});
