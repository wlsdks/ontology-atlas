import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { AgentSetupSection } from './AgentSetupSection';


const vaultStatus = { current: 'idle' as 'idle' | 'loaded' };
const serverState = { launch: null as null | { command: string; args: string[] } };

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => ({ status: vaultStatus.current, manifest: null }),
}));
vi.mock('@/entities/vault-session/model/use-agent-server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-agent-server')>()),
  useAgentServer: () => ({ launch: serverState.launch }),
}));
vi.mock('@/features/docs-vault-local', () => ({
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

describe('AgentSetupSection', () => {
  it('says no folder is open instead of an empty setup panel', () => {
    vaultStatus.current = 'idle';
    renderSection();
    expect(screen.getByText('agentStatusNoVault')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-setup-panel')).toBeNull();
  });

  // The installed app must not offer its own download (AGENTS.md); `launch` is non-null
  // exactly when a server is bundled.
  it('shows the app link only where no server is bundled', () => {
    vaultStatus.current = 'idle';
    serverState.launch = null;
    const { unmount } = renderSection();
    expect(screen.getByTestId('agents-terminal-setup-download')).toBeInTheDocument();
    expect(screen.getByTestId('agents-terminal-setup-copy')).toBeInTheDocument();
    unmount();

    serverState.launch = { command: '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp', args: [] };
    renderSection();
    expect(screen.queryByTestId('agents-terminal-setup-download')).toBeNull();
    expect(screen.getByTestId('agents-terminal-setup-copy')).toBeInTheDocument();
    serverState.launch = null;
  });

  // The card asks for a folder, so opening one must be possible in place.
  it('opens a folder from the no-folder notice', () => {
    vaultStatus.current = 'idle';
    renderSection();
    expect(screen.getByTestId('agents-open-vault')).toBeInTheDocument();
  });

  it('shows the setup panel and the first-contact proof packet when a folder is open', () => {
    vaultStatus.current = 'loaded';
    renderSection();
    expect(screen.getByTestId('vault-agent-setup-panel')).toBeInTheDocument();
    expect(screen.getByTestId('agents-mcp-proof-copy')).toBeInTheDocument();
  });
});
