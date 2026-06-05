import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsNav } from './OperationsNav';

const mocks = vi.hoisted(() => ({
  isDesktopRuntime: false,
  dataSourceMode: 'static' as 'static' | 'local',
  pathname: '/ontology',
  localVault: {
    handle: null as { name?: string } | null,
    manifest: null as { docs: unknown[] } | null,
  },
}));

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.dataSourceMode,
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => mocks.localVault,
}));

vi.mock('@/features/locale-switch', () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock('@/features/theme-toggle', () => ({
  ThemeToggle: () => <button type="button">theme</button>,
}));

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
    ...props
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...props}>
      {children}
    </a>
  ),
  usePathname: () => mocks.pathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const messages: Record<string, Record<string, string>> = {
      modeBadge: {
        demoAriaLabelDownload: 'Demo mode — install the macOS app to start local vault work',
        demoAriaLabelPicker: 'Demo mode — open a local vault folder',
        demoLabel: 'demo',
        demoTooltipDownload: 'Demo mode — install the macOS app to start writable local vault work',
        demoTooltipPicker: 'Demo mode — open a local vault folder to start saving changes',
        vaultDocs: `${values?.count ?? 0} documents`,
        vaultLabel: 'Vault',
        vaultTooltip: `Vault mode — ${values?.name ?? 'vault'} (${values?.count ?? 0} documents).`,
      },
      nav: {
        ariaLabel: 'Operations',
        ariaLabelMobile: 'Mobile operations',
        back: 'Back',
        backToWorkspace: 'Back to workspace',
        docs: 'Source vault',
        ontology: 'Ontology',
        topology: 'Topology',
        tooltipDocs: 'Source vault — separate guide docs from ontology nodes',
        tooltipOntology: 'Ontology — review concepts, relations, changes, and saves',
        tooltipTopology: 'Topology — inspect the project map and return to changes',
      },
      'nav.settingsMenu': {
        agentBody: 'Review MCP settings, tools/list proof, and graph DB gates on the connection and verification screen.',
        agentCta: 'Open verification',
        agentTitle: 'AI agent connection',
        appearanceBody: 'Switch between light and dark display modes.',
        appearanceTitle: 'Display',
        closeLabel: 'Close app settings',
        clientClaudeBody: 'Use Settings or Developer logs for server status, then start a fresh session and confirm tools/list plus first calls.',
        clientClaudeTitle: 'Claude Desktop / Claude Code',
        clientCodexBody: 'Run codex mcp list, then confirm the tool namespace exposes list_kinds, validate_vault, and query_ontology in this session.',
        clientCodexTitle: 'Codex',
        clientCursorVsCodeBody: 'Check the MCP settings file or integrations panel, then verify Agent mode can browse and enable the server tools.',
        clientCursorVsCodeTitle: 'Cursor / VS Code',
        clientInspectorBody: 'Use the connection pane and Tools tab to list schemas and run a sample call before trusting a server change.',
        clientInspectorTitle: 'MCP Inspector',
        clientProofBody: "Most MCP clients separate setup from live proof. Check both the configuration surface and the current session's tool inventory.",
        clientProofTitle: 'Where other clients prove it',
        directProofBody: 'The current Codex or Claude session must expose tools/list with 24 tools, index_project, and callable query_ontology.',
        directProofTitle: 'Direct MCP proof',
        fallbackProofBody: 'mcp-verify proves the local server and vault are healthy when the current agent has not loaded the MCP tools yet.',
        fallbackProofTitle: 'CLI fallback proof',
        languageBody: 'Switch between Korean and English.',
        languageTitle: 'Language',
        settingsTabsAriaLabel: 'Settings sections',
        tabAgent: 'Agent',
        tabAgentDesc: 'First calls and client proof.',
        tabApp: 'App',
        tabAppDesc: 'Display, language, and vault.',
        tabConnection: 'Connection',
        tabConnectionDesc: 'Current MCP proof state.',
        setupReadyBody: 'Confirms the repo has .mcp.json and Codex config pointing at this vault. This is setup, not live session proof.',
        setupReadyTitle: 'Setup ready',
        settingsLabel: 'Settings',
        connectionStatusTitle: 'MCP connection status',
        generalSettingsTitle: 'General settings',
        staleCacheBody: 'If the tool description still says 23 tools or query_ontology is missing, treat it as stale client cache or an agent reload issue.',
        staleCacheTitle: 'Cache mismatch',
        proofDecisionFallback: 'If the namespace is stale, use CLI fallback and reload the agent before claiming live proof.',
        proofDecisionInventory: 'tools/list with 24 tools proves the server inventory is current.',
        proofDecisionSession: 'The current agent namespace must show query_ontology before you call it direct MCP proof.',
        proofDecisionSetup: 'Config present only means the server can be started.',
        proofDecisionTitle: 'How to decide',
        subtitle: 'Adjust display, language, local source vault, and AI agent connection checks in one place.',
        title: 'App settings',
        triggerAria: 'Open app settings',
        triggerTitle: 'Open display, language, source vault, and MCP connection settings',
        vaultBodyLocal: 'Open the current local source vault to review files and ontology nodes.',
        vaultBodyStatic: 'Use the macOS app or local source vault flow before selecting a writable folder.',
        vaultCtaLocal: 'Open source vault',
        vaultCtaStatic: 'Start local vault',
        vaultTitle: 'Source vault',
        mcpProofBody:
          'Connection is proven in the agent session, not by this screen alone. Run these first calls after Codex or Claude sees the server.',
        mcpProofCallAgent: '3. query_ontology({"operation":"agent_brief"})',
        mcpProofCallCodex: '1. codex mcp list',
        mcpProofCallHealth: '5. query_ontology({"operation":"health"})',
        mcpProofCallTools: '2. Confirm tools/list has 24 tools, index_project, and query_ontology',
        mcpProofCallWorkspace: '4. query_ontology({"operation":"workspace_brief"})',
        mcpProofCopied: 'Copied',
        mcpProofCopy: 'Copy',
        mcpProofDirectLabel: 'Direct MCP proof in the current agent session',
        mcpProofFallback: 'Fallback: pnpm cli:mcp-verify docs/ontology --timeout-ms 15000',
        mcpProofFallbackLabel: 'CLI fallback proof only',
        mcpProofStaleCache: 'If it still says 23 tools or query_ontology is missing, reload/restart the agent or refresh cached MCP tools',
        mcpProofTitle: 'MCP first calls',
        projectIndexApply: 'Write only after review: add --apply when the human accepts the candidate batch.',
        projectIndexCli:
          'CLI plan: node cli/src/index.mjs index /Users/jinan/side-project/oh-my-ontology --vault docs/ontology --json --threshold 2',
        projectIndexMcp: 'MCP: index_project({"rootPath":"/Users/jinan/side-project/oh-my-ontology"})',
        projectIndexTitle: 'Project ontology indexing checkpoint',
      },
    };
    return messages[namespace]?.[key] ?? key;
  },
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  isTauriVaultRuntime: () => mocks.isDesktopRuntime,
}));

vi.mock('@/shared/ui', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/widgets/ontology-sub-nav', () => ({
  OntologySubNav: () => <div data-testid="ontology-sub-nav" />,
  shouldShowOntologySubNav: () => false,
}));

describe('OperationsNav desktop acquisition boundary', () => {
  beforeEach(() => {
    mocks.isDesktopRuntime = false;
    mocks.dataSourceMode = 'static';
    mocks.pathname = '/ontology';
    mocks.localVault = { handle: null, manifest: null };
  });

  it('routes hosted browser demo badges to the app download page', () => {
    render(<OperationsNav />);

    for (const link of screen.getAllByRole('link', {
      name: /Demo mode — install the macOS app to start local vault work/i,
    })) {
      expect(link).toHaveAttribute('href', '/download/');
      expect(link.className).toContain('h-8');
    }
    expect(
      screen.getAllByRole('link', {
        name: /Demo mode — install the macOS app to start local vault work/i,
      }).some((link) => link.textContent?.includes('demo')),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: /open a local vault folder/i })).not.toBeInTheDocument();
  });

  it('keeps the installed desktop app demo badge on the native local picker path', () => {
    mocks.isDesktopRuntime = true;

    render(<OperationsNav />);

    for (const link of screen.getAllByRole('link', {
      name: /Demo mode — open a local vault folder/i,
    })) {
      expect(link).toHaveAttribute('href', '/docs/?intent=local');
      expect(link.className).toContain('h-8');
    }
    expect(screen.queryByRole('link', { name: /install the macOS app/i })).not.toBeInTheDocument();
  });

  it('keeps the three primary app surfaces directly reachable', () => {
    render(<OperationsNav />);

    expect(screen.getAllByRole('link', { name: /Source vault — separate/ })[0]).toHaveAttribute(
      'href',
      '/docs/',
    );
    expect(screen.getAllByRole('link', { name: /Ontology — review/ })[0]).toHaveAttribute(
      'href',
      '/ontology/',
    );
    expect(screen.getAllByRole('link', { name: /Topology — inspect/ })[0]).toHaveAttribute(
      'href',
      '/topology/',
    );
  });

  it('keeps the compact mobile home link large enough to hit', () => {
    render(<OperationsNav />);

    const homeLinks = screen.getAllByRole('link', { name: 'Back to workspace' });
    expect(homeLinks.some((link) => link.className.includes('min-w-8'))).toBe(true);
  });

  it('separates mobile status from the primary surface tabs', () => {
    render(<OperationsNav />);

    expect(screen.getByTestId('operations-mobile-status')).toBeInTheDocument();
    expect(screen.getByTestId('operations-mobile-tabs')).toHaveAttribute(
      'aria-label',
      'Mobile operations',
    );
  });

  it('opens a real app settings menu from the desktop gear instead of using the gear as a single-purpose theme toggle', () => {
    mocks.dataSourceMode = 'local';
    mocks.localVault = { handle: { name: 'ontology' }, manifest: { docs: Array.from({ length: 81 }) } };

    render(<OperationsNav />);

    const trigger = screen.getAllByTestId('app-settings-trigger')[0];
    expect(trigger).toHaveAttribute('aria-label', 'Open app settings');
    expect(trigger).toHaveAttribute(
      'title',
      'Open display, language, source vault, and MCP connection settings',
    );
    expect(trigger).toHaveTextContent('Settings');

    const popover = screen.getAllByTestId('app-settings-popover')[0];
    const popoverScreen = within(popover);
    expect(screen.getAllByTestId('app-settings-overlay')[0].className).toContain('overflow-hidden');
    expect(screen.getAllByTestId('app-settings-overlay')[0].className).toContain('items-center');
    expect(screen.getAllByTestId('app-settings-overlay')[0].className).toContain('justify-center');
    expect(screen.getAllByTestId('app-settings-overlay')[0].className).toContain('p-3');
    expect(screen.getAllByTestId('app-settings-body')[0].className).toContain('overflow-hidden');
    expect(popover).toHaveAttribute('role', 'dialog');
    expect(popover.className).toContain('h-[calc(100dvh-1.5rem)]');
    expect(popover.className).toContain('max-h-[42rem]');
    expect(popover.className).toContain('overflow-hidden');
    expect(popover).toHaveTextContent('App settings');
    expect(popoverScreen.getByRole('tablist', { name: 'Settings sections' })).toBeInTheDocument();
    expect(popoverScreen.getByRole('tab', { name: /Connection/i })).toHaveAttribute('aria-selected', 'true');
    expect(popoverScreen.getByRole('tab', { name: /Agent/i })).toHaveAttribute('aria-selected', 'false');
    expect(popoverScreen.getByRole('tab', { name: /App/i })).toHaveAttribute('aria-selected', 'false');
    expect(popover).toHaveTextContent('MCP connection status');
    expect(popoverScreen.getByTestId('mcp-connection-status-summary')).toHaveTextContent('Setup ready');
    expect(popoverScreen.getByTestId('mcp-connection-status-summary')).toHaveTextContent('Direct MCP proof');
    expect(popoverScreen.getByTestId('mcp-connection-status-summary')).toHaveTextContent('CLI fallback proof');
    expect(popoverScreen.getByTestId('mcp-connection-status-summary')).toHaveTextContent('Cache mismatch');
    expect(popover).toHaveTextContent('setup, not live session proof');
    expect(popover).toHaveTextContent('24 tools, index_project, and callable query_ontology');
    expect(popover).toHaveTextContent('mcp-verify proves the local server and vault are healthy');
    expect(popover).toHaveTextContent('tool description still says 23 tools or query_ontology is missing');
    expect(popoverScreen.getByTestId('mcp-proof-decision-order')).toHaveTextContent('How to decide');
    expect(popoverScreen.getByTestId('mcp-proof-decision-order')).toHaveTextContent(
      'Config present only means the server can be started',
    );
    expect(popoverScreen.getByTestId('mcp-proof-decision-order')).toHaveTextContent(
      'tools/list with 24 tools proves the server inventory is current',
    );
    expect(popoverScreen.getByTestId('mcp-proof-decision-order')).toHaveTextContent(
      'current agent namespace must show query_ontology',
    );
    expect(popoverScreen.getByTestId('mcp-proof-decision-order')).toHaveTextContent(
      'use CLI fallback and reload the agent',
    );
    expect(popover).not.toHaveTextContent('MCP first calls');

    fireEvent.click(popoverScreen.getByRole('tab', { name: /Agent/i }));
    expect(popoverScreen.getByRole('tab', { name: /Agent/i })).toHaveAttribute('aria-selected', 'true');
    expect(popover).toHaveTextContent('MCP first calls');
    expect(popoverScreen.getByTestId('direct-mcp-proof')).toHaveTextContent(
      'Direct MCP proof in the current agent session',
    );
    expect(popover).toHaveTextContent('codex mcp list');
    expect(popover).toHaveTextContent('Confirm tools/list has 24 tools, index_project, and query_ontology');
    expect(popover).toHaveTextContent('query_ontology({"operation":"agent_brief"})');
    expect(popover).toHaveTextContent('query_ontology({"operation":"workspace_brief"})');
    expect(popover).toHaveTextContent('query_ontology({"operation":"health"})');
    expect(popoverScreen.getByTestId('cli-fallback-proof')).toHaveTextContent('CLI fallback proof only');
    expect(popover).toHaveTextContent('query_ontology is missing, reload/restart the agent');
    expect(popover).toHaveTextContent('pnpm cli:mcp-verify docs/ontology --timeout-ms 15000');
    expect(popoverScreen.getByTestId('project-indexing-checkpoint')).toHaveTextContent(
      'Project ontology indexing checkpoint',
    );
    expect(popoverScreen.getByTestId('project-indexing-checkpoint')).toHaveTextContent(
      'index_project({"rootPath":"/Users/jinan/side-project/oh-my-ontology"})',
    );
    expect(popoverScreen.getByTestId('project-indexing-checkpoint')).toHaveTextContent(
      'node cli/src/index.mjs index /Users/jinan/side-project/oh-my-ontology --vault docs/ontology --json --threshold 2',
    );
    expect(popoverScreen.getByTestId('project-indexing-checkpoint')).toHaveTextContent(
      'Write only after review',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'Where other clients prove it',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'separate setup from live proof',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent('Codex');
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'list_kinds, validate_vault, and query_ontology',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'Claude Desktop / Claude Code',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'Settings or Developer logs',
    );
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent('Cursor / VS Code');
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent('Agent mode');
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent('MCP Inspector');
    expect(popoverScreen.getByTestId('mcp-client-proof-locations')).toHaveTextContent(
      'connection pane and Tools tab',
    );
    expect(popoverScreen.getByRole('button', { name: /Copy/i })).toBeInTheDocument();

    fireEvent.click(popoverScreen.getByRole('tab', { name: /App/i }));
    expect(popoverScreen.getByRole('tab', { name: /App/i })).toHaveAttribute('aria-selected', 'true');
    expect(popover).toHaveTextContent('General settings');
    expect(popover).toHaveTextContent('Display');
    expect(popover).toHaveTextContent('Language');
    expect(popover).toHaveTextContent('Source vault');
    expect(popover).toHaveTextContent('AI agent connection');
    expect(screen.getAllByTestId('locale-switch').length).toBeGreaterThanOrEqual(2);
    expect(popoverScreen.getByRole('link', { name: /Open source vault/i })).toHaveAttribute(
      'href',
      '/docs/',
    );
    expect(popoverScreen.getByRole('link', { name: /Open verification/i })).toHaveAttribute(
      'href',
      '/ontology/insights/',
    );
  });

  it('lets keyboard and pointer users dismiss the app settings panel predictably', async () => {
    render(<OperationsNav />);

    const trigger = screen.getAllByTestId('app-settings-trigger')[0];
    const details = trigger.closest('details');
    expect(details).not.toBeNull();

    fireEvent.click(trigger);
    expect(details).toHaveAttribute('open');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const popover = screen.getAllByTestId('app-settings-popover')[0];
    await waitFor(() => expect(popover).toHaveFocus());

    fireEvent.keyDown(popover, { key: 'Escape' });
    await waitFor(() => expect(details).not.toHaveAttribute('open'));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(details).toHaveAttribute('open');
    fireEvent.click(within(popover).getByRole('button', { name: 'Close app settings' }));
    await waitFor(() => expect(details).not.toHaveAttribute('open'));

    fireEvent.click(trigger);
    expect(details).toHaveAttribute('open');
    fireEvent.mouseDown(screen.getAllByTestId('app-settings-overlay')[0]);
    await waitFor(() => expect(details).not.toHaveAttribute('open'));
  });

  it('keeps app settings reachable from the mobile status row', () => {
    render(<OperationsNav />);

    const mobileStatus = screen.getByTestId('operations-mobile-status');
    expect(mobileStatus).toHaveTextContent('Settings');
    expect(within(mobileStatus).getByTestId('app-settings-trigger')).toHaveAttribute(
      'aria-label',
      'Open app settings',
    );
  });
});
