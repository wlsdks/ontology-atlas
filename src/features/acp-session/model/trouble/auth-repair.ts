import { claudeLoginRepairCommand } from './claude-login-repair';

/**
 * The way back from a sign-in trouble depends on which tool holds the sign-in. Claude Code can be
 * shadowed by a stale keychain entry the app's config folder made; Codex keeps no keychain entry
 * and reads the terminal's `~/.codex/auth.json` through a link, so the only repair is signing in
 * there again. Any other tool gets no command: a command for the wrong tool does nothing.
 */
export type AuthRepair =
  | { tool: 'claude'; command: string }
  | { tool: 'codex'; command: string }
  | { tool: 'other'; command: null };

export const CODEX_LOGIN_COMMAND = 'codex login';

export function authRepairOf(runtimeId: string | null | undefined): AuthRepair {
  if (runtimeId === 'claude-acp') return { tool: 'claude', command: claudeLoginRepairCommand() };
  if (runtimeId === 'codex-acp') return { tool: 'codex', command: CODEX_LOGIN_COMMAND };
  return { tool: 'other', command: null };
}
