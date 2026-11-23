import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcpTurnCompletion } from '@/features/acp-session';
import { folderMappingRun, workRuns, type MappingFigures, type TurnWorkReport } from '@/features/work-run';

import {
  mappingFiguresOf,
  MAPPING_FOLDER_STILL_MS,
  MAPPING_FOLDER_WAIT_MS,
  MAPPING_SILENCE_CHECK_MS,
  MAPPING_SWITCH_AFTER_MS,
  useMappingRun,
  type MappingRunDriver,
  type MappingSessionPort,
} from './use-mapping-run';

const FOLDER = '/Users/probe/launch';
const KEY = `mapping:${FOLDER}`;

const one = (uncovered: number, total = 120): MappingFigures => ({
  widest: { abilitiesUncovered: uncovered, abilitiesTotal: total },
  sum: { abilitiesUncovered: uncovered, abilitiesTotal: total },
});

const mapping = () => folderMappingRun(workRuns.read(), FOLDER);

/** Lets the clock run, so the driver's waits and the session's promises settle inside `act`. */
const advance = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

/**
 * The agent session as the driver sees it: a send starts a turn at once, and the spec ends it by
 * calling the observer the driver handed back, as the session does. The clock is fake throughout.
 */
function harness(readQueue: Array<MappingFigures | null | Promise<MappingFigures | null>>) {
  const sent: string[] = [];
  const shown: string[] = [];
  const stopRequest = vi.fn();
  const newConversation = vi.fn(async () => {});
  const state = {
    status: 'ready',
    waitingForAnswer: false,
    work: null as TurnWorkReport | null,
    otherRequestWaiting: false,
    draft: '',
    limited: false,
    folderFiles: {} as object | null,
  };
  let completion: ((result: AcpTurnCompletion) => Promise<void>) | null = null;
  let driver: MappingRunDriver | null = null;
  const reads = [...readQueue];
  const readFigures = vi.fn(async () => (reads.length > 1 ? reads.shift() ?? null : reads[0] ?? null));
  const session = (): MappingSessionPort => ({
    ...state,
    lastTurnUpdateAt: null,
    send: async (text: string, line: string) => {
      sent.push(text);
      shown.push(line);
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
      request: (figures, part) => ({
        text: `map the rest: ${figures ? figures.sum.abilitiesUncovered : 'none'} left`,
        shown: `request ${part}`,
      }),
    });
    driver = result;
    return result;
  });
  /** Long enough for a folder that stays still to let the next request out. */
  const settle = () => advance(MAPPING_FOLDER_STILL_MS);
  /** Ends the running request as the session would; resolves once the driver has decided. */
  const finishTurn = (outcome: AcpTurnCompletion['outcome'] = 'completed') => {
    const observer = completion;
    completion = null;
    if (!observer) throw new Error('no request of the run is running');
    return observer({ ...turnOf(sent.at(-1) ?? ''), endedAt: '', outcome, stopReason: null, events: [] });
  };
  return {
    sent,
    shown,
    stopRequest,
    newConversation,
    state,
    readFigures,
    hook,
    settle,
    finishTurn,
    rerender: () => hook.rerender(),
    press: async () => {
      act(() => hook.result.current.start());
      await advance(0);
      await advance(0);
    },
    /** Ends the running request, then lets the driver read the disk, wait for a still folder and decide. */
    end: async (outcome: AcpTurnCompletion['outcome'] = 'completed') => {
      const ended = finishTurn(outcome);
      await settle();
      await settle();
      await act(async () => {
        await ended;
      });
    },
    turnStart: (text: string) => driver?.observeTurnStart(turnOf(text)) ?? null,
  };
}

const turnOf = (text: string) => ({ runtimeId: 'claude-acp', sessionId: 's', vaultRoot: FOLDER, userEventId: `u-${text.length}`, text, startedAt: '' });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  workRuns.leaveFolder(FOLDER, 0);
});
afterEach(() => {
  vi.useRealTimers();
  workRuns.reset();
});

describe('one press sends request after request', () => {
  it('sends each request in a new conversation until the line on disk is gone, each shown as one line', async () => {
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
    expect(run.shown).toEqual(['request 1', 'request 2', 'request 3']);
    expect(run.newConversation).toHaveBeenCalledTimes(3);
    expect(run.hook.result.current.driving).toBe(false);
  });

  it('reads a request\'s end once the folder\'s reload has landed and stayed still, then lets the row move before the next conversation', async () => {
    const run = harness([one(96), one(72), one(40), one(20)]);
    await run.press();
    const first = run.finishTurn();
    await advance(MAPPING_FOLDER_STILL_MS - 100);
    expect(run.readFigures).toHaveBeenCalledTimes(1);
    run.state.folderFiles = {};
    run.rerender();
    await advance(MAPPING_FOLDER_STILL_MS - 100);
    // Until the folder is still the request's end is not read: the figures stay and the conversation too.
    expect(run.readFigures).toHaveBeenCalledTimes(1);
    expect(mapping()).toMatchObject({ requestsSent: 1 });
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    await advance(100);
    expect(mapping()).toMatchObject({ phase: 'running', requestsSent: 2 });
    await advance(MAPPING_SWITCH_AFTER_MS - 10);
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    await advance(10);
    expect(run.newConversation).toHaveBeenCalledTimes(2);
    expect(run.sent).toHaveLength(2);
    await act(async () => {
      await first;
    });

    const second = run.finishTurn();
    const stepMs = 500;
    for (let elapsed = 0; elapsed < MAPPING_FOLDER_WAIT_MS - stepMs; elapsed += stepMs) {
      run.state.folderFiles = {};
      run.rerender();
      await advance(stepMs);
      expect(run.sent).toHaveLength(2);
    }
    run.state.folderFiles = {};
    run.rerender();
    // The bound ends the wait at its limit, though the folder changed half a second ago.
    await advance(stepMs);
    await advance(MAPPING_SWITCH_AFTER_MS);
    expect(run.sent).toHaveLength(3);
    await act(async () => {
      await second;
    });
  });

  it('ends at once with the request\'s own figures when Stop comes while the folder settles', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    const ended = run.finishTurn();
    await advance(100);
    act(() => run.hook.result.current.stop());
    await advance(0);
    await act(async () => {
      await ended;
    });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press', now: one(72) });
    expect(run.stopRequest).not.toHaveBeenCalled();
    await run.settle();
    expect(run.newConversation).toHaveBeenCalledTimes(1);
  });

  it('stops for a message typed while the folder settles, before any new conversation', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    const ended = run.finishTurn();
    await advance(MAPPING_FOLDER_STILL_MS / 2);
    run.state.draft = 'Why is billing split in two?';
    run.rerender();
    await run.settle();
    await act(async () => {
      await ended;
    });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'message' });
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    expect(run.sent).toHaveLength(1);
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
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'message' });
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
    // A stopping run waits for no folder: its end is read as soon as the turn has ended.
    const ended = run.finishTurn('cancelled');
    await advance(0);
    await act(async () => {
      await ended;
    });
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
    // The row's Stop and the composer's Stop both reach the driver's `stop`.
    act(() => run.hook.result.current.stop());
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
    const ending = run.finishTurn();
    await advance(0);
    expect(run.turnStart('Explain billing')).toBeNull();
    release(one(72));
    await run.settle();
    await act(async () => {
      await ending;
    });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'message' });
    expect(run.newConversation).toHaveBeenCalledTimes(1);
  });

  it('cancels a request the agent went silent in and ends it as an agent error', async () => {
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
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.waitingForAnswer = true;
    run.state.work = { kind: 'writing', label: null, target: 'capabilities/billing.md', asking: true };
    run.rerender();
    await advance(0);
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
