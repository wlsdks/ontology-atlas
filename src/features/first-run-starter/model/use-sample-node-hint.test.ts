import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settled: true,
}));

vi.mock('./use-first-run-sample-mode-settled', () => ({
  useFirstRunSampleModeSettled: () => mocks.settled,
}));

import { useSampleNodeHint } from './use-sample-node-hint';
import { SAMPLE_NODE_HINT_DISMISSED_KEY } from './sample-node-hint';

afterEach(() => {
  window.localStorage.clear();
  mocks.settled = true;
});

describe('useSampleNodeHint', () => {
  it('is visible in settled sample mode with no selection and not yet dismissed', () => {
    const { result } = renderHook(() => useSampleNodeHint(false));
    expect(result.current.visible).toBe(true);
  });

  it('is hidden once a vault is active (sample mode no longer settled)', () => {
    mocks.settled = false;
    const { result } = renderHook(() => useSampleNodeHint(false));
    expect(result.current.visible).toBe(false);
  });

  it('first node selection permanently dismisses it (localStorage) and hides it', async () => {
    const { result, rerender } = renderHook(
      ({ hasSelection }) => useSampleNodeHint(hasSelection),
      { initialProps: { hasSelection: false } },
    );
    expect(result.current.visible).toBe(true);

    // Display switches off at once (`!hasSelection`); the permanent record waits for a microtask,
    // so it is checked after a flush.
    rerender({ hasSelection: true });
    expect(result.current.visible).toBe(false);
    await waitFor(() => {
      expect(window.localStorage.getItem(SAMPLE_NODE_HINT_DISMISSED_KEY)).toBe('1');
    });

    // Clearing the selection does not bring the hint back.
    rerender({ hasSelection: false });
    expect(result.current.visible).toBe(false);
  });

  it('stays hidden on a later visit once it was dismissed before (localStorage memory)', () => {
    window.localStorage.setItem(SAMPLE_NODE_HINT_DISMISSED_KEY, '1');
    const { result } = renderHook(() => useSampleNodeHint(false));
    expect(result.current.visible).toBe(false);
  });
});
