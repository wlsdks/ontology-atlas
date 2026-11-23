import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcpTurnCompletion } from '@/features/acp-session';
import { folderMappingRun, workRuns, type MappingFigures, type TurnWorkReport } from '@/features/work-run';

import { mappingFiguresOf, MAPPING_RESEND_DELAY_MS, MAPPING_RESENDS, MAPPING_SILENCE_CHECK_MS, useMappingRun, type MappingRunDriver, type MappingSessionPort } from './use-mapping-run';

const FOLDER = '/Users/probe/launch';
const KEY = `mapping:${FOLDER}`;

const one = (uncovered: number, total = 120): MappingFigures => ({
  widest: { abilitiesUncovered: uncovered, abilitiesTotal: total },
  sum: { abilitiesUncovered: uncovered, abilitiesTotal: total },
});

const mapping = () => folderMappingRun(workRuns.read(), FOLDER);

/**
 * The agent session as the driver sees it: a send starts a turn at once, and the spec ends it by
 * calling the observer the driver handed back, as the session does.
 */
function harness(readQueue: Array<MappingFigures | null | Promise<MappingFigures | null>>) {
  const sent: string[] = [];
  const stopRequest = vi.fn();
  const newConversation = vi.fn(async () => {});
  const state = { status: 'ready', waitingForAnswer: false, work: null as TurnWorkReport | null, otherRequestWaiting: false, draft: '', limited: false };
  let completion: ((result: AcpTurnCompletion) => Promise<void>) | null = null;
  let driver: MappingRunDriver | null = null;
  const reads = [...readQueue];
  const readFigures = vi.fn(async () => (reads.length > 1 ? reads.shift() ?? null : reads[0] ?? null));
  const session = (): MappingSessionPort => ({
    ...state,
    lastTurnUpdateAt: null,
    send: async (text: string) => {
      sent.push(text);
      completion = driver?.observeTurnStart(turnOf(text)) ?? null;
    },
    newConversation,
    stopRequest,
    hasDraft: () => state.draft.trim().length > 0,
    usageLimited: () => state.limited,
  });
  const hook = renderHook(() => {
    const result = useMappingRun({
      folder: FOLDER,
      folderName: 'launch',
      agent: 'Claude Agent',
      session: session(),
      readFigures,
      request: (figures) => `map the rest: ${figures ? figures.sum.abilitiesUncovered : 'none'} left`,
    });
    driver = result;
    return result;
  });
  const settle = () => act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    sent,
    stopRequest,
    newConversation,
    state,
    readFigures,
    hook,
    settle,
    rerender: () => hook.rerender(),
    press: async () => {
      act(() => hook.result.current.start());
      await settle();
      await settle();
    },
    /** Ends the running request as the session would, then lets the driver read the disk and decide. */
    /** The session refused the turn before the agent saw it: the folder moved under its baseline. */
    refusedByBaseline: () => {
      const observer = completion;
      completion = null;
      if (!observer) throw new Error('no request of the run is running');
      return observer({ ...turnOf(sent.at(-1) ?? ''), endedAt: '', outcome: 'cancelled', stopReason: 'capture_context_changed', events: [] });
    },
    end: async (outcome: AcpTurnCompletion['outcome'] = 'completed') => {
      const observer = completion;
      completion = null;
      if (!observer) throw new Error('no request of the run is running');
      await act(async () => {
        await observer({ ...turnOf(sent.at(-1) ?? ''), endedAt: '', outcome, stopReason: null, events: [] });
      });
      await settle();
    },
    turnStart: (text: string) => driver?.observeTurnStart(turnOf(text)) ?? null,
  };
}

const turnOf = (text: string) => ({ runtimeId: 'claude-acp', sessionId: 's', vaultRoot: FOLDER, userEventId: `u-${text.length}`, text, startedAt: '' });

beforeEach(() => workRuns.leaveFolder(FOLDER, 0));
afterEach(() => {
  vi.useRealTimers();
  workRuns.reset();
});

describe('one press sends request after request', () => {
  it('sends each request in a new conversation until the line on disk is gone', async () => {
    const run = harness([one(96), one(72), one(40), null]);
    await run.press();
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    expect(run.sent).toEqual(['map the rest: 96 left']);
    expect(run.hook.result.current.driving).toBe(true);

    await run.end();
    expect(run.newConversation).toHaveBeenCalledTimes(2);
    expect(run.sent.at(-1)).toBe('map the rest: 72 left');
    await run.end();
    expect(run.sent.at(-1)).toBe('map the rest: 40 left');
    expect(mapping()).toMatchObject({ phase: 'running', requestsSent: 3 });

    await run.end();
    expect(mapping()).toMatchObject({ phase: 'finished' });
    expect(run.sent).toHaveLength(3);
    expect(run.newConversation).toHaveBeenCalledTimes(3);
    expect(run.hook.result.current.driving).toBe(false);
  });

  it('sends a request again when the folder reloaded under its baseline, and gives up after the resends', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    const run = harness([one(96), one(72)]);
    const flush = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    act(() => run.hook.result.current.start());
    await flush();
    expect(run.sent).toHaveLength(1);
    for (let resend = 1; resend <= MAPPING_RESENDS; resend += 1) {
      const refused = run.refusedByBaseline();
      await flush(MAPPING_RESEND_DELAY_MS);
      await act(async () => { await refused; });
      expect(run.sent).toHaveLength(1 + resend);
      expect(run.newConversation).toHaveBeenCalledTimes(1);
      expect(mapping()).toMatchObject({ phase: 'running', requestsSent: 1 });
    }
    const last = run.refusedByBaseline();
    await flush();
    await act(async () => { await last; });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
    expect(run.sent).toHaveLength(1 + MAPPING_RESENDS);
  });

  it('stays busy and holds the folder between requests, while the next conversation starts', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'starting';
    run.rerender();
    await run.end();
    expect(run.sent).toHaveLength(1);
    expect(run.hook.result.current.driving).toBe(true);
    run.state.status = 'ready';
    run.rerender();
    await run.settle();
    expect(run.sent).toHaveLength(2);
  });

  it('waits for a request the person sent while the agent started, and that turn stops the run', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.otherRequestWaiting = true;
    run.rerender();
    await run.end();
    expect(run.sent).toHaveLength(1);
    act(() => {
      run.turnStart('What does billing do?');
    });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
    run.state.otherRequestWaiting = false;
    run.rerender();
    await run.settle();
    expect(run.sent).toHaveLength(1);
  });
});

describe('every stop rule ends the run without another request', () => {
  it('stops when a request does not lower the abilities off the map', async () => {
    const run = harness([one(96), one(96)]);
    await run.press();
    await run.end();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'noProgress' });
    expect(run.sent).toHaveLength(1);
    expect(run.newConversation).toHaveBeenCalledTimes(1);
  });

  it('tells an agent error from a usage limit by the session\'s trouble', async () => {
    const failed = harness([one(96), one(80)]);
    await failed.press();
    await failed.end('failed');
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
    workRuns.closeRun(KEY);

    const limited = harness([one(96), one(80)]);
    await limited.press();
    limited.state.limited = true;
    await limited.end('failed');
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'usageLimit' });
  });

  it('ends a request stopped mid-way exactly once, as the person\'s Stop', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    const ends = vi.spyOn(workRuns, 'endMappingBatch');
    act(() => {
      workRuns.stopRun(KEY);
      workRuns.stopRun(KEY);
    });
    expect(run.stopRequest).toHaveBeenCalledTimes(1);
    expect(mapping()?.phase).toBe('stopping');
    await run.end('cancelled');
    expect(ends).toHaveBeenCalledTimes(1);
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
    expect(run.sent).toHaveLength(1);
  });

  it('ends at once when Stop comes between requests, and sends nothing after', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'starting';
    run.rerender();
    await run.end();
    act(() => workRuns.stopRun(KEY));
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
    expect(run.stopRequest).not.toHaveBeenCalled();
    run.state.status = 'ready';
    run.rerender();
    await run.settle();
    expect(run.sent).toHaveLength(1);
  });

  it('stops for a draft in the composer at the boundary and leaves the conversation as it is', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.draft = 'Why is billing split in two?';
    run.rerender();
    await run.end();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'message' });
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    expect(run.sent).toHaveLength(1);
  });

  it('stops for the person\'s own turn sent while the request\'s end is read', async () => {
    let release: (figures: MappingFigures) => void = () => {};
    const slowRead = new Promise<MappingFigures>((resolve) => {
      release = resolve;
    });
    const run = harness([one(96), slowRead]);
    await run.press();
    const ending = run.end();
    await run.settle();
    expect(run.turnStart('Explain billing')).toBeNull();
    release(one(72));
    await ending;
    await run.settle();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'message' });
    expect(run.newConversation).toHaveBeenCalledTimes(1);
  });

  it('cancels a request the agent went silent in and ends it as an agent error', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const run = harness([one(96), one(72)]);
    await run.press();
    act(() => {
      vi.advanceTimersByTime(9 * 60_000);
    });
    expect(run.stopRequest).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60_000 + MAPPING_SILENCE_CHECK_MS);
    });
    expect(run.stopRequest).toHaveBeenCalledTimes(1);
    await run.end('cancelled');
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
  });

  it('waits on a permission card with no clock and never answers it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.waitingForAnswer = true;
    run.state.work = { kind: 'writing', label: null, target: 'capabilities/billing.md', asking: true };
    run.rerender();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mapping()?.phase).toBe('asking');
    act(() => {
      vi.advanceTimersByTime(30 * 60_000);
    });
    expect(run.stopRequest).not.toHaveBeenCalled();
    expect(run.sent).toHaveLength(1);
    expect(mapping()?.phase).toBe('asking');
  });
});

describe('the figures a folder\'s project lines give', () => {
  it('sums the lines for progress and shows the project with the most left', () => {
    expect(mappingFiguresOf([
      { abilitiesUncovered: 30, abilitiesTotal: 200 },
      null,
      { abilitiesUncovered: 90, abilitiesTotal: 150 },
    ])).toEqual({ widest: { abilitiesUncovered: 90, abilitiesTotal: 150 }, sum: { abilitiesUncovered: 120, abilitiesTotal: 350 } });
    expect(mappingFiguresOf([null])).toBeNull();
  });
});
