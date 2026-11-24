import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { authRepairOf, readAcpTrouble } from '@/features/acp-session';
import type { useAgentDoctor } from '@/features/acp-doctor';

import type { ChatT } from './chat-panel-props';
import { ErrorCard } from './ErrorCard';
import { troubleHintKeyOf } from './trouble-hint-key';

vi.mock('@/i18n/navigation', () => ({ Link: (props: Record<string, unknown>) => <a {...props} /> }));

afterEach(cleanup);

const t = ((key: string) => key) as unknown as ChatT;
const AUTH_ERROR = 'Internal error: Failed to authenticate: OAuth session expired (authentication_failed)';
const doctor = { scanButton: null, result: null } as unknown as ReturnType<typeof useAgentDoctor>;

function renderAuthCard(runtimeId: string) {
  const trouble = readAcpTrouble(AUTH_ERROR);
  const repair = authRepairOf(runtimeId);
  render(
    <ErrorCard
      t={t}
      error={AUTH_ERROR}
      diagnostics={[]}
      trouble={trouble}
      troubleHintKey={troubleHintKeyOf(trouble, false, repair.tool)}
      authRepairCommand={repair.command}
      retryDisabled={false}
      onRetry={() => {}}
      showDoctor={false}
      doctor={doctor}
    />,
  );
  return screen.getByTestId('acp-chat-error');
}

describe('the sign-in card speaks for the session\'s own tool', () => {
  it('Claude Code keeps the keychain explanation and its repair command', () => {
    const card = renderAuthCard('claude-acp');
    expect(card.textContent).toContain('trouble.auth.hint');
    expect(card.textContent).not.toContain('trouble.auth.hintCodex');
    expect(screen.getByTestId('acp-chat-auth-repair').textContent).toMatch(/^security delete-generic-password/);
  });

  it('Codex says to sign in from the terminal and shows codex login, not the keychain command', () => {
    const card = renderAuthCard('codex-acp');
    expect(card.textContent).toContain('trouble.auth.hintCodex');
    expect(screen.getByTestId('acp-chat-auth-repair').textContent).toBe('codex login');
    expect(card.textContent).not.toContain('security delete-generic-password');
  });

  it('another tool gets the neutral line and no command', () => {
    const card = renderAuthCard('gemini-acp');
    expect(card.textContent).toContain('trouble.auth.hintOther');
    expect(screen.queryByTestId('acp-chat-auth-repair')).toBeNull();
    expect(card.textContent).not.toContain('security delete-generic-password');
  });
});
