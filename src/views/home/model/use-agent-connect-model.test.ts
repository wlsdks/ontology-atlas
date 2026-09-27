import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAgentConnectModel } from './use-agent-connect-model';

/**
 * **Is one attached right now** — the only question this model answers.
 *
 * Until 2026-08-21 this file also measured what the connect sheet drew
 * (registration snippet, domain names, "N minutes ago"). The sheet retired
 * into a destination (decision ledger 90), those values dropped to **zero
 * readers**, and the tests shrank with them: a test that keeps measuring what
 * nobody reads stays green while guarding nothing.
 *
 * "N minutes ago" in particular was computed from the timestamp taken when the
 * sheet **opened**. With no sheet the reference time is `0`, so it renders the
 * time since 1970 — leave a dead value behind and the next person draws it.
 */

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
