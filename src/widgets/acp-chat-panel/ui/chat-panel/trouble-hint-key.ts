import type { AuthRepair } from '@/features/acp-session';

/** Sign-in hints name the tool that holds the sign-in; another tool's repair does nothing. */
const AUTH_HINT_KEY: Readonly<Record<AuthRepair['tool'], string>> = {
  claude: 'trouble.auth.hint',
  codex: 'trouble.auth.hintCodex',
  other: 'trouble.auth.hintOther',
};

/**
 * The hint under a connection trouble. A usage limit has no way out when this is the only tool, so it
 * gets its own sentence.
 */
export function troubleHintKeyOf(
  trouble: { kind: string } | null,
  canChooseAnotherTool: boolean,
  authTool: AuthRepair['tool'],
): string {
  if (trouble?.kind === 'limit' && !canChooseAnotherTool) return 'trouble.limit.hintOnlyTool';
  if (trouble?.kind === 'auth') return AUTH_HINT_KEY[authTool];
  return `trouble.${trouble?.kind ?? 'unknown'}.hint`;
}
