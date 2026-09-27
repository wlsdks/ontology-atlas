/**
 * Connecting from the web finishes in place: what is copied must be runnable, so a config still
 * holding a placeholder is not copyable.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { useAgentClientControls, type AgentClientControlsProps } from './AgentClientButtons';

// The smallest host for the hook: with no launchable server it returns the degradation card
// plus the by-hand panel.
function AgentClientButtons(props: AgentClientControlsProps) {
  const { serverUnavailable, controls } = useAgentClientControls(props);
  return <div data-testid="agent-client-buttons">{controls ? null : serverUnavailable}</div>;
}
import { WebManualConnectPanel } from './WebManualConnectPanel';
import ko from '../../../../messages/ko.json';

function renderPanel() {
  return render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <WebManualConnectPanel />
    </NextIntlClientProvider>,
  );
}

function fill(testId: string, value: string) {
  fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

describe('WebManualConnectPanel manual path entry', () => {
  it('shows a real config with placeholders before paths are filled', () => {
    renderPanel();
    const body = screen.getByTestId('web-manual-connect-config-body');
    expect(body.textContent).toContain('mcpServers');
    expect(body.textContent).toContain('[폴더의 절대 경로]');
  });

  /*
   * `/mcp` carries the page's own tab bar above this panel; the client row parameterises one
   * config block, so it is a radiogroup, not a second tablist.
   */
  it('uses a radiogroup rather than a second tablist for the client choice', () => {
    renderPanel();

    expect(screen.queryAllByRole('tablist'), 'the panel rendered its own tablist').toHaveLength(0);
    const group = screen.getByRole('radiogroup');
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByTestId('web-manual-connect-tool-claude-code')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  /*
   * Going through `SegmentedControl` brings arrow-key movement with the radiogroup role.
   */
  it('moves between clients with arrow keys', () => {
    renderPanel();

    const first = screen.getByTestId('web-manual-connect-tool-claude-code');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    expect(screen.getByTestId('web-manual-connect-tool-codex')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('does not copy an incomplete config', () => {
    renderPanel();
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
    expect(screen.getByTestId('web-manual-connect-copy-cli')).toBeDisabled();

    fill('web-manual-connect-vault-input', '/Users/me/notes');
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();

    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeEnabled();
    expect(screen.getByTestId('web-manual-connect-copy-verify')).toBeEnabled();
  });

  it('produces a runnable config without placeholders once both paths are filled', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '/Users/me/notes');
    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    const parsed = JSON.parse(screen.getByTestId('web-manual-connect-config-body').textContent ?? '');
    expect(parsed.mcpServers['ontology-atlas'].env.OATLAS_VAULT).toBe('/Users/me/notes');
    expect(parsed.mcpServers['ontology-atlas'].args).toEqual([
      '/Users/me/ontology-atlas/mcp/src/index.js',
    ]);
  });

  it('switches the config file and format with the selected client', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '/Users/me/notes');
    fill('web-manual-connect-checkout-input', '/Users/me/ontology-atlas');
    fireEvent.click(screen.getByTestId('web-manual-connect-path-confirmation'));
    fireEvent.click(screen.getByTestId('web-manual-connect-tool-codex'));
    const card = screen.getByTestId('web-manual-connect-config-codex');
    expect(within(card).getByText('.codex/config.toml')).toBeInTheDocument();
    expect(screen.getByTestId('web-manual-connect-config-body').textContent).toContain(
      '[mcp_servers.ontology-atlas]',
    );
  });

  it('flags a tilde path and explains why it fails', () => {
    renderPanel();
    fill('web-manual-connect-vault-input', '~/notes');
    expect(screen.getByTestId('web-manual-connect-vault-input-issue').textContent).toMatch(/물결/);
    expect(screen.getByTestId('web-manual-connect-copy-config')).toBeDisabled();
  });

  it('flags a relative path', () => {
    renderPanel();
    fill('web-manual-connect-checkout-input', './atlas');
    expect(screen.getByTestId('web-manual-connect-checkout-input-issue').textContent).toMatch(
      /절대 경로/,
    );
  });

  it('does not flag an empty value as an error', () => {
    renderPanel();
    expect(screen.queryByTestId('web-manual-connect-vault-input-issue')).toBeNull();
  });

  it('states that only the path shape is checked', () => {
    /*
     * Assert against the message itself, not a typed excerpt (`documentation.md`: never pin a
     * sentence a human wrote).
     */
    renderPanel();
    expect(screen.getByTestId('web-manual-connect-shape-only').textContent).toContain(
      ko.agentConnect.manualShapeOnlyNote,
    );
  });
});

describe('AgentClientButtons web fallback is not a dead end', () => {
  it('offers manual config in place instead of saying connection is impossible', () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <AgentClientButtons
          serverAvailability={{ kind: 'unavailable', launch: null, binaryPath: null, reason: null }}
          onWriteConfigs={null}
          cursorDeeplink={null}
          mcpJsonSnippet="{}"
          codexCommand="codex mcp add"
          needsManualPath
        />
      </NextIntlClientProvider>,
    );
    const card = screen.getByTestId('agent-server-unavailable');
    expect(card.textContent).not.toMatch(/연결할 수 없어요/);
    // It names exactly one thing as impossible: saving the file automatically.
    expect(card.textContent).toMatch(/설정 파일을 대신 저장하지 못해요/);
    // The app remains the easier path.
    expect(screen.getByTestId('agent-connect-web-get-app')).toBeInTheDocument();
    expect(screen.getByTestId('web-manual-connect')).toBeInTheDocument();
  });
});
