import { afterEach, describe, expect, it, vi } from 'vitest';

import { refuseOpenAsk, type OpenAskSlots } from './refuse-open-ask';

function slots(overrides: Partial<{ resolver: ((optionId: string | null) => void) | null; timer: number | null }> = {}) {
  const resolver = 'resolver' in overrides ? overrides.resolver ?? null : vi.fn();
  const setPending = vi.fn();
  const open: OpenAskSlots = {
    permissionDecisionTimerRef: { current: overrides.timer ?? null },
    pendingResolverRef: { current: resolver },
    setPending,
  };
  return { open, resolver, setPending };
}

afterEach(() => vi.useRealTimers());

describe('refusing the card that is waiting for an answer', () => {
  it('answers the agent with a rejection, never an option, and takes the card down', () => {
    const { open, resolver, setPending } = slots();
    refuseOpenAsk(open);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith(null);
    expect(open.pendingResolverRef.current).toBeNull();
    expect(setPending).toHaveBeenCalledWith(null);
  });

  it('cancels a write that was waiting out its settle delay before it is answered', () => {
    vi.useFakeTimers();
    const answered = vi.fn();
    const timer = window.setTimeout(() => answered('allow'), 500);
    const { open } = slots({ timer });
    refuseOpenAsk(open);
    vi.advanceTimersByTime(1000);
    expect(answered).not.toHaveBeenCalled();
    expect(open.permissionDecisionTimerRef.current).toBeNull();
  });

  it('is safe when nothing is waiting, and answers only once when called twice', () => {
    const empty = slots({ resolver: null });
    expect(() => refuseOpenAsk(empty.open)).not.toThrow();
    expect(empty.setPending).toHaveBeenCalledWith(null);

    const { open, resolver } = slots();
    refuseOpenAsk(open);
    refuseOpenAsk(open);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
