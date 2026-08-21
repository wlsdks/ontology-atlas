import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { AgentSetupSection } from './AgentSetupSection';

/**
 * 「MCP 연결」 칸 — **2026-08-21 에 설정 시트에서 옮겨 왔다**(원장 90).
 *
 * 여기 있는 두 검사는 `AppSettingsMenu.test.tsx` 에서 **따라온 것**이다. 그 화면이
 * 시트를 떠났으니 검사도 따라와야 한다 — 옛 자리에 두면 시트가 안 그리는 것을
 * 계속 재게 되고, 그건 초록인 채로 아무것도 안 지키는 검사가 된다.
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
   * **요구하는 행동을 그 자리에서 할 수 있어야 한다** (2026-08-11 북극성 워크스루,
   * 2026-08-21 e2e `open-vault-cta` 가 이관 직후 같은 결함을 다시 잡았다).
   *
   * 이 카드는 「폴더를 열면 …」이라고 말한다. 여는 길이 같은 자리에 없으면
   * 이 저장소가 이름 붙여 금지한 **막다른 CTA** 다.
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
    // 표면은 옮겨도 **핸드오프는 산다** — 이관 중 이 버튼이 사라질 뻔했다.
    expect(screen.getByTestId('agents-mcp-proof-copy')).toBeInTheDocument();
  });
});
