import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AcpTurnCompletion } from '@/features/acp-session';
import { folderMappingRun, workRuns, type MappingFigures, type TurnWorkReport } from '@/features/work-run';

import {
  MAPPING_FOLDER_STILL_MS,
  MAPPING_FOLDER_WAIT_MS,
  MAPPING_SILENCE_CHECK_MS,
  MAPPING_SWITCH_AFTER_MS,
  useMappingRun,
  widestProjectLine,
  type MappingRunDriver,
  type MappingSessionPort,
} from './use-mapping-run';

const FOLDER = '/Users/probe/launch';
const OTHER = '/Users/probe/atlas';
const KEY = `mapping:${FOLDER}`;

const one = (uncovered: number, total = 120): MappingFigures => ({ abilitiesUncovered: uncovered, abilitiesTotal: total });

const mapping = () => folderMappingRun(workRuns.read(), FOLDER);

/** Lets the clock run, so the driver's waits and the session's promises settle inside `act`. */
const advance = (ms: number) => act(async () => {
  await vi.advanceTimersByTimeAsync(ms);
});

/**
 * The agent session as the driver sees it: a send starts a turn at once, and the spec ends it by
 * calling the observer the driver handed back, as the session does. The clock is fake throughout.
 * The first figures are the press's read of the widest project, the rest that project's reads.
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
    folderRoot: FOLDER as string | null,
  };
  let completion: ((result: AcpTurnCompletion) => Promise<void>) | null = null;
  let driver: MappingRunDriver | null = null;
  const reads = [...readQueue];
  const readFigures = vi.fn(async () => (reads.length > 1 ? reads.shift() ?? null : reads[0] ?? null));
  const readProject = vi.fn(async (_project: string) => readFigures());
  const figures = {
    widest: async () => {
      const line = await readFigures();
      return line ? { project: 'launch', figures: line } : null;
    },
    project: readProject,
  };
  const session = (): MappingSessionPort => ({
    ...state,
    // Read when the driver acts, as the panel's live session is.
    get status() {
      return state.status;
    },
    lastTurnUpdateAt: null,
    send: async (text: string, line: string) => {
      sent.push(text);
      shown.push(line);
      state.status = 'thinking';
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
      figures,
      request: (now, part) => ({
        text: `map the rest: ${now ? now.abilitiesUncovered : 'none'} left`,
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
    if (state.status === 'thinking') state.status = 'ready';
    return observer({ ...turnOf(sent.at(-1) ?? ''), endedAt: '', outcome, stopReason: null, events: [] });
  };
  return {
    sent,
    shown,
    stopRequest,
    newConversation,
    state,
    readFigures,
    readProject,
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
  workRuns.leaveFolder('local:launch#1', 0);
  workRuns.enterFolderRoot(FOLDER);
});
afterEach(() => {
  vi.useRealTimers();
  workRuns.reset();
});

describe('one press sends request after request', () => {
  it('sends each request in a new conversation until the line on disk is gone, each shown as one line', async () => {
    const run = harness([one(96), one(72), one(30), null]);
    await run.press();
    expect(run.newConversation).toHaveBeenCalledTimes(1);
    expect(run.sent).toEqual(['map the rest: 96 left']);
    expect(run.hook.result.current.driving).toBe(true);

    await run.end();
    expect(run.newConversation).toHaveBeenCalledTimes(2);
    expect(run.sent.at(-1)).toBe('map the rest: 72 left');
    await run.end();
    expect(run.sent.at(-1)).toBe('map the rest: 30 left');
    expect(mapping()).toMatchObject({ phase: 'running', requestsSent: 3 });
    expect(run.readProject.mock.calls.map(([project]) => project)).toEqual(['launch', 'launch']);

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

describe('no phase of the driver waits without an end', () => {
  it('ends the run when the session sits stopped while the next request waits to go out', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'starting';
    run.rerender();
    await run.end();
    expect(mapping()?.phase).toBe('running');
    run.state.status = 'idle';
    run.rerender();
    await advance(0);
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
    expect(run.sent).toHaveLength(1);
  });

  it('ends a request whose session went away without ending its turn', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'exited';
    run.rerender();
    await run.settle();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
    expect(run.sent).toHaveLength(1);
  });

  it('ends the request itself when Stop finds a turn the session no longer runs', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'ready';
    act(() => run.hook.result.current.stop());
    await advance(0);
    expect(run.stopRequest).not.toHaveBeenCalled();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
  });

  it('ends the request itself when the silence rule finds a turn the session no longer runs', async () => {
    const run = harness([one(96), one(72)]);
    await run.press();
    run.state.status = 'ready';
    await advance(10 * 60_000 + MAPPING_SILENCE_CHECK_MS);
    await run.settle();
    expect(run.stopRequest).not.toHaveBeenCalled();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
  });

  it('ends a request that cannot open its conversation once the agent has been silent too long', async () => {
    const run = harness([one(96), one(72)]);
    run.newConversation.mockImplementation(() => new Promise<void>(() => {}));
    await run.press();
    expect(run.sent).toHaveLength(0);
    await advance(10 * 60_000 + MAPPING_SILENCE_CHECK_MS);
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'agentError' });
  });

  it.each([
    ['while a request runs', async (run: ReturnType<typeof harness>) => run.press()],
    ['while the folder settles', async (run: ReturnType<typeof harness>) => {
      await run.press();
      void run.finishTurn();
      await advance(100);
    }],
    ['while the row moves before the next conversation', async (run: ReturnType<typeof harness>) => {
      await run.press();
      void run.finishTurn();
      await run.settle();
      expect(mapping()?.requestsSent).toBe(2);
      expect(run.newConversation).toHaveBeenCalledTimes(1);
    }],
    ['while the next conversation opens', async (run: ReturnType<typeof harness>) => {
      await run.press();
      run.newConversation.mockImplementation(() => new Promise<void>(() => {}));
      void run.finishTurn();
      await run.settle();
      await run.settle();
      await advance(MAPPING_SWITCH_AFTER_MS);
    }],
  ])('ends the run as stopped when its panel goes %s, and sends nothing after', async (_moment, reach) => {
    const run = harness([one(96), one(72)]);
    await reach(run);
    const conversations = run.newConversation.mock.calls.length;
    run.hook.unmount();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'press' });
    await advance(MAPPING_FOLDER_WAIT_MS + MAPPING_SWITCH_AFTER_MS);
    expect(run.newConversation).toHaveBeenCalledTimes(conversations);
    expect(run.sent).toHaveLength(1);
  });
});

describe('the figures a request ends with', () => {
  it('names a usage limit the session records after the turn has ended', async () => {
    const run = harness([one(96), one(80)]);
    await run.press();
    const ended = run.finishTurn('failed');
    await advance(0);
    run.state.limited = true;
    await run.settle();
    await act(async () => {
      await ended;
    });
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'usageLimit' });
  });

  it('stops with the line lost when the project note no longer holds it and more was left than one request maps', async () => {
    const run = harness([one(96), null]);
    await run.press();
    await run.end();
    expect(mapping()).toMatchObject({ phase: 'stopped', stopReason: 'lineLost', now: one(96) });
  });

  it('keeps the run\'s figures when the files granted now belong to another folder', async () => {
    const run = harness([one(96), one(10)]);
    await run.press();
    run.state.folderRoot = OTHER;
    run.rerender();
    await run.end();
    expect(run.readProject).not.toHaveBeenCalled();
    expect(mapping()?.now).toEqual(one(96));
  });

  it('keeps the run\'s figures when it ended because the folder was switched', async () => {
    const run = harness([one(96), one(10)]);
    await run.press();
    act(() => workRuns.enterFolderRoot(OTHER));
    expect(run.stopRequest).toHaveBeenCalledTimes(1);
    await run.end('cancelled');
    expect(run.readProject).not.toHaveBeenCalled();
    expect(folderMappingRun(workRuns.read(), FOLDER)).toMatchObject({ phase: 'stopped', stopReason: 'switched', now: one(96) });
  });
});

describe('the project a run reads', () => {
  it('is the one with the most abilities off the map, never a sum of several', () => {
    expect(widestProjectLine([
      { project: 'billing', figures: one(30, 200) },
      { project: 'empty', figures: null },
      { project: 'loans', figures: one(90, 150) },
    ])).toEqual({ project: 'loans', figures: one(90, 150) });
    expect(widestProjectLine([{ project: 'empty', figures: null }])).toBeNull();
  });
});
