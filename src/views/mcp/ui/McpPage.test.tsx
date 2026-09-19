import type { ReactNode } from 'react';
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
  SettingsGroupHeading: ({ label, trailing }: { label: string; trailing?: ReactNode }) => (
    <div>
      <h3>{label}</h3>
      {trailing}
    </div>
  ),
}));
vi.mock('@/features/mcp-connectors', () => ({
  ConnectorsPanel: () => <div data-testid="connectors-panel" />,
  useVaultConnectors: () => store,
}));
vi.mock('@/features/docs-vault-local', () => ({ OpenVaultCta: () => <button type="button" /> }));
vi.mock('@/entities/vault-session', () => ({ useLocalVault: () => ({ status: 'idle', handle: null }) }));

let store: VaultConnectorsState;

const FAKE_HANDLE = { name: 'vault' } as unknown as FileSystemDirectoryHandle;

function draw(next: Partial<VaultConnectorsState>, handle: FileSystemDirectoryHandle | null = FAKE_HANDLE) {
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
      <McpPage connectors={store} handle={handle} />
    </NextIntlClientProvider>,
  );
}

describe('MCP 탭 — 답하기 전에는 쓰라고 하지 않는다', () => {
  it('폴더를 읽는 중에는 추가 버튼을 내지 않는다', () => {
    draw({ status: 'loading' });
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
  });

  it('파일이 우리 것이 아니면 추가 버튼을 내지 않는다 — 쓸 수 없는 상태다', () => {
    draw({ status: 'malformed' });
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
  });

  it('스토어가 답하면 추가 버튼이 선다', () => {
    draw({
      status: 'ready',
      connectors: [
        { id: 'a', name: 'one', transport: 'http', url: 'https://x', args: [], env: [], headers: [], enabled: true },
      ] as VaultConnectorsState['connectors'],
    });
    expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument();
  });
});

describe('MCP 탭 — 폴더는 한 번만 청한다', () => {
  it('폴더가 없으면 연결 도구 칸은 카드 대신 한 줄로, 두 번째 버튼 없이', () => {
    draw({ status: 'unavailable' }, null);
    expect(screen.getByTestId('mcp-connectors-need-folder')).toBeInTheDocument();
    // The share group above already asks and carries the button; the panel is not drawn at all.
    expect(screen.queryByTestId('connectors-panel')).toBeNull();
  });

  it('폴더가 있으면 연결 도구 판을 그대로 그린다', () => {
    draw({ status: 'ready' });
    expect(screen.getByTestId('connectors-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-connectors-need-folder')).toBeNull();
  });
});

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
