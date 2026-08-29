import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../messages/en.json';
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';
import {
  AgentMascotPresence,
  MASCOT_SUCCESS_HOLD_MS,
  MASCOT_WALK_MS,
} from './AgentMascotPresence';

const NOW = Date.parse('2026-08-29T00:00:00.000Z');
const mocks = vi.hoisted(() => ({ feed: {} as AgentActivityFeed }));

vi.mock('../model/use-agent-activity-feed', () => ({
  useAgentActivityFeed: () => mocks.feed,
}));

const feed = (overrides: Partial<AgentActivityFeed> = {}): AgentActivityFeed => ({
  showStatus: true,
  nowMs: NOW,
  writing: false,
  lastAt: NOW,
  agentName: 'Codex',
  work: {
    mode: 'idle',
    agentName: 'Codex',
    rawAgentName: 'codex-mcp-client',
    phase: null,
    summary: null,
    targetSlug: null,
    files: [],
    nextStep: null,
    lastTool: null,
    updatedAt: null,
  },
  lastNode: null,
  lastTargetUnnamed: false,
  notifications: [],
  workReceipts: [],
  unreadCount: 0,
  notificationsEnabled: true,
  markAllRead: vi.fn(),
  ...overrides,
});

const ui = () => (
  <NextIntlClientProvider locale="en" messages={enMessages}>
    <AgentMascotPresence />
  </NextIntlClientProvider>
);

describe('AgentMascotPresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.feed = feed();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('stays absent when there is no verified read work', () => {
    render(ui());
    expect(screen.queryByTestId('agent-mascot-presence')).toBeNull();

    mocks.feed = feed({
      work: { ...feed().work, mode: 'live', phase: 'editing', lastTool: 'patch_concept' },
    });
    const { rerender } = render(ui());
    rerender(ui());
    expect(screen.queryByTestId('agent-mascot-presence')).toBeNull();
  });

  it('walks into a verified read pose, then resolves that sequence to success', () => {
    mocks.feed = feed({
      work: {
        ...feed().work,
        mode: 'live',
        phase: 'planning',
        lastTool: 'list_concepts',
        updatedAt: NOW,
      },
    });
    const { rerender } = render(ui());
    const presence = screen.getByTestId('agent-mascot-presence');
    expect(presence).toHaveAttribute('data-state', 'walk');
    expect(presence).toHaveTextContent('Verified agent reading detected.');

    act(() => vi.advanceTimersByTime(MASCOT_WALK_MS));
    expect(presence).toHaveAttribute('data-state', 'read');
    expect(presence).toHaveTextContent('The agent is reading the ontology.');

    mocks.feed = feed({
      work: { ...feed().work, mode: 'completed', updatedAt: NOW + 1 },
    });
    rerender(ui());
    expect(screen.getByTestId('agent-mascot-presence')).toHaveAttribute('data-state', 'success');
    expect(screen.getByRole('status')).toHaveTextContent('The verified agent work completed.');

    act(() => vi.advanceTimersByTime(MASCOT_SUCCESS_HOLD_MS));
    expect(screen.queryByTestId('agent-mascot-presence')).toBeNull();
  });

  it('keeps the in-flight travel when completion arrives early and never regresses to read', () => {
    mocks.feed = feed({
      work: {
        ...feed().work,
        mode: 'live',
        phase: 'planning',
        lastTool: 'get_concept',
        updatedAt: NOW,
      },
    });
    const { rerender } = render(ui());
    const presence = screen.getByTestId('agent-mascot-presence');
    expect(presence).toHaveAttribute('data-state', 'walk');
    expect(presence).toHaveAttribute('data-traveling', 'true');

    act(() => vi.advanceTimersByTime(MASCOT_WALK_MS / 2));
    mocks.feed = feed({
      work: { ...feed().work, mode: 'completed', updatedAt: NOW + 1 },
    });
    rerender(ui());
    expect(presence).toHaveAttribute('data-state', 'success');
    expect(presence).toHaveAttribute('data-traveling', 'true');

    act(() => vi.advanceTimersByTime(MASCOT_WALK_MS / 2));
    expect(presence).toHaveAttribute('data-state', 'success');
    expect(presence).not.toHaveAttribute('data-traveling');
  });

  it('respects the existing activity visibility preference', () => {
    mocks.feed = feed({
      showStatus: false,
      work: { ...feed().work, mode: 'live', phase: 'planning', lastTool: 'get_concept' },
    });
    render(ui());
    expect(screen.queryByTestId('agent-mascot-presence')).toBeNull();
  });
});
