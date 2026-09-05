import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const chat = vi.hoisted(() => ({ props: vi.fn() }));

vi.mock('@/widgets/acp-chat-panel', () => ({
  AcpChatPanel: (props: Record<string, unknown>) => {
    chat.props(props);
    return (
      <div
        data-testid="mock-acp-chat"
        data-session-enabled={props.sessionEnabled ? 'true' : 'false'}
        data-context={String(props.contextLabel)}
      />
    );
  },
  AcpChatResizeHandle: () => <div data-testid="mock-acp-resize" />,
  useChatWidth: () => ({
    width: 420,
    setWidth: vi.fn(),
    commitWidth: vi.fn(),
  }),
}));

vi.mock('@/widgets/analysis-workbench', () => ({ AnalysisWorkbench: ({ conversation }: { conversation: React.ReactNode }) => <div>{conversation}</div> }));

import { InsightsAgentDock } from './InsightsAgentDock';

const baseProps = {
  runtime: { id: 'claude-acp', label: 'Claude Agent' },
  runtimes: [{ id: 'claude-acp', label: 'Claude Agent' }],
  onRuntimeChange: vi.fn(),
  vaultRoot: '/repo/atlas',
  mcpServers: [{ name: 'atlas-vault' }],
  prefillRequest: { kind: 'flow' as const, text: 'Explain this flow', nonce: 1 },
  contextLabel: 'Analysis · Flow',
  knownSlugs: new Set(['ontology-atlas']),
  knownRelations: new Set<string>(),
  onDraftPresenceChange: vi.fn(),
  onPresentationOpenMap: vi.fn(),
  onClose: vi.fn(),
  onEvidence: vi.fn(),
  analysisContext: { mode: 'meaning' as const, surface: 'analysis' as const, handle: null, writable: false, fileHandles: new Map(), graph: { nodes: [], edges: [] }, scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null }, sourceFingerprint: null, profileHash: null },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  chat.props.mockClear();
});

describe('InsightsAgentDock', () => {
  it('starts with reduced motion even when no width transition event fires', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('reduced-motion') || query.includes('min-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    render(<InsightsAgentDock open {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute('data-session-enabled', 'true');
    });
  });

  it('keeps a closed frame mounted before the first Analysis request', () => {
    render(
      <InsightsAgentDock
        {...baseProps}
        open={false}
        prefillRequest={null}
        contextLabel=""
      />,
    );

    expect(screen.getByTestId('insights-agent-dock-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-acp-chat')).not.toBeInTheDocument();
  });

  it('starts one prefill-only session after the Analysis width reflow', () => {
    render(<InsightsAgentDock open {...baseProps} />);

    expect(screen.getByTestId('insights-agent-dock')).toBeInTheDocument();
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute('data-session-enabled', 'false');
    expect(chat.props).toHaveBeenLastCalledWith(expect.objectContaining({
      prefillRequest: baseProps.prefillRequest,
      contextLabel: 'Analysis · Flow',
      presentationIntent: 'business-flow',
      runtimeId: 'claude-acp',
    }));

    fireEvent.transitionEnd(screen.getByTestId('insights-agent-dock-frame'), {
      propertyName: 'width',
    });
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute('data-session-enabled', 'true');
  });

  it('keeps the conversation mounted when only the visible Analysis context around it changes', () => {
    const view = render(<InsightsAgentDock open {...baseProps} />);
    fireEvent.transitionEnd(screen.getByTestId('insights-agent-dock-frame'), {
      propertyName: 'width',
    });
    const chatNode = screen.getByTestId('mock-acp-chat');

    view.rerender(
      <InsightsAgentDock
        open
        {...baseProps}
        contextLabel="Analysis · Connections"
      />,
    );
    expect(screen.getByTestId('mock-acp-chat')).toBe(chatNode);
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-context',
      'Analysis · Connections',
    );
  });

  it('seats a new explicit tab request without waiting for another dock transition', async () => {
    const view = render(<InsightsAgentDock open {...baseProps} />);
    fireEvent.transitionEnd(screen.getByTestId('insights-agent-dock-frame'), {
      propertyName: 'width',
    });

    const nextRequest = {
      kind: 'boundaries' as const,
      text: 'Explain these boundaries',
      nonce: 2,
    };
    view.rerender(
      <InsightsAgentDock
        open
        {...baseProps}
        prefillRequest={nextRequest}
        contextLabel="Analysis · Boundaries"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
        'data-session-enabled',
        'true',
      );
    });
    expect(chat.props).toHaveBeenLastCalledWith(expect.objectContaining({
      prefillRequest: nextRequest,
      contextLabel: 'Analysis · Boundaries',
    }));
  });

  it('uses a side dock at the installed-app minimum and a work-area sheet below lg', () => {
    render(<InsightsAgentDock open {...baseProps} />);

    const frame = screen.getByTestId('insights-agent-dock-frame');
    expect(frame).toHaveClass('absolute', 'w-full', 'lg:relative');
    expect(frame.className).toContain('lg:w-[var(--insights-agent-chat-width)]');
    expect(screen.getByTestId('insights-agent-dock')).toHaveClass('left-3', 'lg:left-auto');
    expect(screen.getByTestId('mock-acp-resize').parentElement).toHaveClass(
      'hidden',
      'lg:contents',
    );
  });
});
