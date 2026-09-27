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

describe('MCP tab offers no write before the store answers', () => {
  it('shows no add button while the folder is loading', () => {
    draw({ status: 'loading' });
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
  });

  it('shows no add button when the file is not ours to write', () => {
    draw({ status: 'malformed' });
    expect(screen.queryByTestId('connectors-add-open')).toBeNull();
  });

  it('shows the add button once the store answers', () => {
    draw({
      status: 'ready',
      connectors: [
        { id: 'a', name: 'one', transport: 'http', url: 'https://x', args: [], env: [], headers: [], enabled: true },
      ] as VaultConnectorsState['connectors'],
    });
    expect(screen.getByTestId('connectors-add-open')).toBeInTheDocument();
  });
});

describe('MCP tab asks for a folder once', () => {
  it('renders the connector section as one line without a second button when no folder is open', () => {
    draw({ status: 'unavailable' }, null);
    expect(screen.getByTestId('mcp-connectors-need-folder')).toBeInTheDocument();
    // The share group above already asks and carries the button; the panel is not drawn at all.
    expect(screen.queryByTestId('connectors-panel')).toBeNull();
  });

  it('renders the connector board when a folder is open', () => {
    draw({ status: 'ready' });
    expect(screen.getByTestId('connectors-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-connectors-need-folder')).toBeNull();
  });
});

describe('MCP tab states no count it does not know yet', () => {
  it('claims no count in the heading while the folder is loading', () => {
    draw({ status: 'loading' });
    expect(screen.getByText(ko.mcp.connectorsHeading)).toBeInTheDocument();
  });

  /*
   * Both numbers, because the card below stopped saying the denominator on 2026-09-20 and this
   * heading is now the only place it appears. A heading that dropped back to "1 on" would leave
   * a person unable to tell a missing connector from a switched-off one.
   */
  it('states the enabled and total counts once the store answers', () => {
    draw({
      status: 'ready',
      connectors: [
        { id: 'a', name: 'one', transport: 'http', url: 'https://x', args: [], env: [], headers: [], enabled: true },
        { id: 'b', name: 'two', transport: 'http', url: 'https://y', args: [], env: [], headers: [], enabled: false },
      ] as VaultConnectorsState['connectors'],
    });
    const heading = screen.getByRole('heading', { level: 3 }).textContent ?? '';
    expect(heading).toContain('1');
    expect(heading).toContain('2');
  });
});
