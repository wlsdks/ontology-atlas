import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import ko from '../../../../messages/ko.json';
import { McpPage } from './McpPage';
import type { VaultConnectorsState } from '@/features/mcp-connectors';

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/widgets/app-settings-menu', () => ({
  AgentSetupSection: () => <div data-testid="agent-setup-section" />,
  SettingsGroupHeading: ({ label }: { label: string }) => <h3>{label}</h3>,
}));
vi.mock('@/features/mcp-connectors', () => ({
  ConnectorsPanel: () => <div data-testid="connectors-panel" />,
  useVaultConnectors: () => store,
}));
vi.mock('@/features/docs-vault-local', () => ({ OpenVaultCta: () => <button type="button" /> }));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => ({ status: 'idle', handle: null }) }));

let store: VaultConnectorsState;

function draw(next: Partial<VaultConnectorsState>) {
  store = {
    status: 'loading',
    connectors: [],
    secretLiteralKeys: [],
    reload: vi.fn(),
    setEnabled: vi.fn(),
    upsert: vi.fn(),
    remove: vi.fn(),
    ...next,
  } as VaultConnectorsState;
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <McpPage connectors={store} handle={null} />
    </NextIntlClientProvider>,
  );
}

describe('MCP 탭 — 아직 모르는 수를 말하지 않는다', () => {
  it('폴더를 읽는 중에는 머리글이 개수를 주장하지 않는다', () => {
    draw({ status: 'loading' });
    expect(screen.getByText(ko.mcp.connectorsHeading)).toBeInTheDocument();
  });

  it('스토어가 답하면 그때 켜 둔 수를 말한다', () => {
    draw({
      status: 'ready',
      connectors: [
        { id: 'a', name: 'one', transport: 'http', url: 'https://x', args: [], env: [], headers: [], enabled: true },
        { id: 'b', name: 'two', transport: 'http', url: 'https://y', args: [], env: [], headers: [], enabled: false },
      ] as VaultConnectorsState['connectors'],
    });
    expect(screen.getByRole('heading', { level: 3 }).textContent).toContain('1');
  });
});
