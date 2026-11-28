import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import { describe, expect, it, vi } from 'vitest';

import { AgentSetupSection } from './AgentSetupSection';


const vaultStatus = { current: 'idle' as 'idle' | 'loaded' };
const serverState = { launch: null as null | { command: string; args: string[] } };

vi.mock('@/entities/vault-session/model/vault-provider/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/vault-provider/LocalVaultProvider')>()),
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
    <IntlProvider
      locale="ko"
      messages={{}}
      onError={() => undefined}
      getMessageFallback={({ key }) => key}
    >
      <AgentSetupSection />
    </IntlProvider>,
  );
}

describe('AgentSetupSection', () => {
  it('says no folder is open instead of an empty setup panel', () => {
    vaultStatus.current = 'idle';
    renderSection();
    expect(screen.getByText('agentStatusNoVault')).toBeInTheDocument();
    expect(screen.queryByTestId('vault-agent-setup-panel')).toBeNull();
  });

  // Connecting is the app's work; the no-folder card offers no checkout-only terminal lines.
  it('shows no source-checkout command in the no-folder notice', () => {
    vaultStatus.current = 'idle';
    const { container } = renderSection();
    expect(container.textContent).not.toMatch(/\$ATLAS|cli\/src\/index\.mjs/);
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
