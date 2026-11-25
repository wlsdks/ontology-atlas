import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AgentSessionRow } from '@/shared/lib/work-status/tauri-work-status';
import { buildWorkTracks } from '@/shared/lib/work-status/work-tracks';
import { useSessionStateSince } from './use-session-state-since';

const tracks = buildWorkTracks({
  status: 'ready', root: '/repo', repository: 'repo', host: null, baseBranch: 'main',
  worktrees: [{
    id: 'a', path: '/repo/a', branch: 'feat/a', head: 'h', mainCheckout: false, missing: false, standing: 'ahead', ahead: 1,
    lastCommitAt: null, lastCommitAuthor: null, lock: null, acpPid: null, agentProcesses: [{ pid: 41, tool: 'claudeCode', startedAt: 1_000 }],
  }],
});
const rows = (state: AgentSessionRow['state']): AgentSessionRow[] => [{ worktreeId: 'a', pid: 41, state }];

describe('useSessionStateSince', () => {
  it('counts a session first seen from its start, and a later state from the read that brought it', () => {
    const working = rows('working');
    const { result, rerender } = renderHook(({ read, atMs }) => useSessionStateSince(read, atMs, tracks), { initialProps: { read: working, atMs: 5_000_000 } });
    expect(result.current.get(41)).toEqual({ state: 'working', sinceMs: 1_000_000, sinceStart: true });

    const before = result.current;
    rerender({ read: working, atMs: 6_000_000 });
    expect(result.current).toBe(before);

    rerender({ read: rows('waitingApproval'), atMs: 7_000_000 });
    expect(result.current.get(41)).toEqual({ state: 'waitingApproval', sinceMs: 7_000_000, sinceStart: false });
  });
});
