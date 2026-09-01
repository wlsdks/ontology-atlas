import { act, render, screen } from '@testing-library/react';
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
  AcpChatResizeHandle: () => null,
  useChatWidth: () => ({
    width: 420,
    setWidth: vi.fn(),
    commitWidth: vi.fn(),
  }),
}));

import { ArchitectureAgentDock } from './ArchitectureAgentDock';

const baseProps = {
  runtime: { id: 'claude-acp', label: 'Claude Code' },
  runtimes: [{ id: 'claude-acp', label: 'Claude Code' }],
  onRuntimeChange: vi.fn(),
  vaultRoot: '/repo/atlas',
  mcpServers: [{ name: 'atlas-vault' }],
  openingRequest: { text: 'Inspect the architecture', nonce: 1 },
  knownSlugs: new Set(['capabilities/example']),
  onClose: vi.fn(),
};

afterEach(() => {
  vi.useRealTimers();
  chat.props.mockClear();
});

describe('ArchitectureAgentDock', () => {
  it('renders the conversation immediately but starts the process after width reflow settles', () => {
    vi.useFakeTimers();
    render(<ArchitectureAgentDock open {...baseProps} />);

    expect(screen.getByTestId('architecture-agent-dock')).toBeInTheDocument();
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'false',
    );
    expect(chat.props).toHaveBeenLastCalledWith(
      expect.objectContaining({
        openingRequest: { text: 'Inspect the architecture', nonce: 1 },
        runtimeId: 'claude-acp',
        vaultRoot: '/repo/atlas',
      }),
    );

    act(() => vi.advanceTimersByTime(240));
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'true',
    );
  });

  it('stops session eligibility as soon as the dock closes while preserving the exit frame', () => {
    vi.useFakeTimers();
    const view = render(<ArchitectureAgentDock open {...baseProps} />);
    act(() => vi.advanceTimersByTime(240));

    view.rerender(<ArchitectureAgentDock open={false} {...baseProps} />);
    expect(screen.getByTestId('architecture-agent-dock')).toBeInTheDocument();
    expect(screen.getByTestId('mock-acp-chat')).toHaveAttribute(
      'data-session-enabled',
      'false',
    );
  });
});
