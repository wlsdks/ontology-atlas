import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAgentConnectModel } from './use-agent-connect-model';


const heartbeat = {
  agent: 'claude',
  updatedAt: new Date('2026-08-21T00:00:00Z').toISOString(),
  focus: { ontologySlug: 'agents-destination' },
};

describe('agent connection state', () => {
  it('none when the heartbeat is missing or invalid', () => {
    expect(
      renderHook(() => useAgentConnectModel({ agentActivityStatus: null })).result.current.status,
    ).toEqual({ kind: 'none' });

    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: false, stale: false },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'none' });
  });

  it('stale for an old heartbeat', () => {
    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: true, stale: true },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'stale' });
  });

  it('connected when alive', () => {
    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: true, stale: false },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'connected' });
  });
});
