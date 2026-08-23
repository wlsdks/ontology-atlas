import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { AgentSetupSection } from './AgentSetupSection';

/**
 * The 「MCP Connection」 pane — **moved out of the settings sheet on 2026-08-21**
 * (ledger 90).
 *
 * The two checks here **came along** from `AppSettingsMenu.test.tsx`. The screen
 * left the sheet, so the checks have to follow — left in the old place they would go
 * on measuring something the sheet no longer draws, which is a check that stays
 * green while enforcing nothing.
 */

const vaultStatus = { current: 'idle' as 'idle' | 'loaded' };

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({ status: vaultStatus.current, manifest: null }),
  useAgentServer: () => ({ launch: null }),
  OpenVaultCta: ({ testId }: { testId: string }) => <button data-testid={testId} />,
}));

vi.mock('./VaultAgentSetupPanel', () => ({
  VaultAgentSetupPanel: () => <div data-testid="vault-agent-setup-panel" />,
}));

function renderSection() {
  return render(
    <NextIntlClientProvider
      locale="ko"
      messages={{}}
      onError={() => undefined}
      getMessageFallback={({ key }) => key}
    >
      <AgentSetupSection />
    </NextIntlClientProvider>,
  );
}

describe('MCP 연결 칸', () => {
  it('폴더를 아직 안 열었으면 빈 설정판 대신 그 사실을 말한다', () => {
    vaultStatus.current = 'idle';
    renderSection();
    expect(screen.getByText('agentStatusNoVault')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-setup-panel')).toBeNull();
  });

  /**
   * **The action being asked for has to be possible right there** (north-star
   * walkthrough 2026-08-11; the e2e `open-vault-cta` caught the same defect again
   * right after the move, 2026-08-21).
   *
   * This card says 「Once you open the folder …」. Without the way to
   * open it in the same place, it is the **dead-end CTA** this repository forbids by
   * name.
   */
  it('폴더를 열라고 말한 자리에서 폴더를 열 수 있다', () => {
    vaultStatus.current = 'idle';
    renderSection();
    expect(screen.getByTestId('agents-open-vault')).toBeInTheDocument();
  });

  it('폴더가 열려 있으면 설정판과 첫 접촉 증명 패킷을 함께 낸다', () => {
    vaultStatus.current = 'loaded';
    renderSection();
    expect(screen.getByTestId('vault-agent-setup-panel')).toBeInTheDocument();
    // The surface may move, but **the handoff lives** — this button nearly disappeared during the move.
    expect(screen.getByTestId('agents-mcp-proof-copy')).toBeInTheDocument();
  });
});
