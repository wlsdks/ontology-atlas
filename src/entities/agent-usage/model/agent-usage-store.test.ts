import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentUsage } from './agent-usage-store';

const tokens = (usedTokens: number) => ({
  sessionId: 's-1',
  context: { usedTokens, windowTokens: 200_000 },
  cost: null,
  limits: {},
});

afterEach(() => agentUsage.reset());

describe('the agent usage store', () => {
  it('keeps the latest reading per agent and points the rail at the one that reported last', () => {
    agentUsage.record({ runtimeId: 'claude-acp', name: null }, tokens(1_000), 1);
    agentUsage.record({ runtimeId: 'codex-acp', name: null }, tokens(5_000), 2);
    agentUsage.record({ runtimeId: 'claude-acp', name: null }, tokens(3_000), 3);
    const { byRuntime, latestRuntimeId } = agentUsage.read();
    expect(byRuntime.get('claude-acp')?.context?.usedTokens).toBe(3_000);
    expect(byRuntime.get('codex-acp')?.context?.usedTokens).toBe(5_000);
    expect(latestRuntimeId).toBe('claude-acp');
  });

  it('tells no listener about an update that states nothing', () => {
    agentUsage.record({ runtimeId: 'claude-acp', name: null }, tokens(1_000), 1);
    const listener = vi.fn();
    const stop = agentUsage.subscribe(listener);
    const before = agentUsage.read();
    agentUsage.record({ runtimeId: 'codex-acp', name: null }, { sessionId: 's-1', context: null, cost: null, limits: {} }, 2);
    expect(listener).not.toHaveBeenCalled();
    expect(agentUsage.read()).toBe(before);
    stop();
  });
});
