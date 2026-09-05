import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const chat = vi.hoisted(() => ({ props: vi.fn() }));

vi.mock('@/widgets/acp-chat-panel', () => ({
  AcpChatPanel: (props: Record<string, unknown>) => {
    chat.props(props);
    return (
      <div
        data-testid="mock-acp-chat"
        data-session-enabled={props.sessionEnabled ? 'true' : 'false'}
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

import { ArchitectureAgentDock } from './ArchitectureAgentDock';

const baseProps = {
  runtime: { id: 'claude-acp', label: 'Claude Code' },
  runtimes: [{ id: 'claude-acp', label: 'Claude Code' }],
  onRuntimeChange: vi.fn(),
  vaultRoot: '/repo/atlas',
  mcpServers: [{ name: 'atlas-vault' }],
  openingRequest: { kind: 'verify' as const, text: 'Inspect the architecture', nonce: 1 },
  knownSlugs: new Set(['capabilities/example']),
  onClose: vi.fn(),
  contextLabel: 'Example',
  onEvidence: vi.fn(),
  analysisContext: { mode: 'architecture' as const, surface: 'architecture' as const, handle: null, writable: false, fileHandles: new Map(), graph: { nodes: [], edges: [] }, scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null }, sourceFingerprint: null, profileHash: null },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  chat.props.mockClear();
});

describe('ArchitectureAgentDock', () => {
  it('renders the conversation immediately but starts the process after width reflow settles', () => {
    render(<ArchitectureAgentDock open {...baseProps} />);

    expect(screen.getByTestId('architecture-agent-dock')).toBeInTheDocument();
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'false',
    );
    expect(chat.props).toHaveBeenLastCalledWith(
      expect.objectContaining({
        openingRequest: { kind: 'verify', text: 'Inspect the architecture', nonce: 1 },
        runtimeId: 'claude-acp',
        vaultRoot: '/repo/atlas',
      }),
    );

    fireEvent.transitionEnd(screen.getByTestId('architecture-agent-dock-frame'), {
      propertyName: 'width',
    });
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'true',
    );
  });

  it('stops session eligibility as soon as the dock closes while preserving the exit frame', () => {
    const view = render(<ArchitectureAgentDock open {...baseProps} />);
    fireEvent.transitionEnd(screen.getByTestId('architecture-agent-dock-frame'), {
      propertyName: 'width',
    });

    view.rerender(<ArchitectureAgentDock open={false} {...baseProps} />);
    expect(screen.getByTestId('architecture-agent-dock')).toBeInTheDocument();
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'false',
    );
  });

  it('can start an analysis after opening history in an already settled dock', () => {
    const view = render(<ArchitectureAgentDock open {...baseProps} openingRequest={null} />);
    fireEvent.transitionEnd(screen.getByTestId('architecture-agent-dock-frame'), { propertyName: 'width' });
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute('data-session-enabled', 'false');
    view.rerender(<ArchitectureAgentDock open {...baseProps} />);
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute('data-session-enabled', 'true');
  });

  it('uses a full work-area sheet below lg and reserves the side dock for wide workbenches', () => {
    render(<ArchitectureAgentDock open {...baseProps} />);

    const frame = screen.getByTestId('architecture-agent-dock-frame');
    expect(frame).toHaveClass('absolute', 'w-full', 'lg:relative');
    expect(frame.className).toContain('lg:w-[var(--architecture-agent-chat-width)]');
    expect(screen.getByTestId('architecture-agent-dock')).toHaveClass('left-3', 'w-auto');
    expect(screen.getByTestId('mock-acp-resize').parentElement).toHaveClass(
      'hidden',
      'lg:contents',
    );
  });
});
