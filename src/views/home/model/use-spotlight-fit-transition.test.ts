import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  buildSpotlightFitSignature,
  useSpotlightFitTransition,
  type SpotlightFitSignatureInput,
} from './use-spotlight-fit-transition';

const EMPTY: SpotlightFitSignatureInput = {
  recentWindow: null,
  spotlightOn: false,
  pathSourceSlug: null,
  pathTargetSlug: null,
  expandAllActive: false,
};

function signature(input: Partial<SpotlightFitSignatureInput> = {}): string {
  return buildSpotlightFitSignature({ ...EMPTY, ...input });
}

describe('useSpotlightFitTransition', () => {
  it('starts with the one-shot token consumed by an initial spotlight fit', () => {
    const { result } = renderHook(() => useSpotlightFitTransition(signature()));

    expect(result.current).toBe(0);
  });

  it('increments once for null → A → null → A', () => {
    const a = signature({ recentWindow: 'auto', spotlightOn: true });
    const { result, rerender } = renderHook(
      ({ current }: { current: string }) => useSpotlightFitTransition(current),
      { initialProps: { current: signature() } },
    );

    rerender({ current: a });
    expect(result.current).toBe(1);
    rerender({ current: signature() });
    expect(result.current).toBe(2);
    rerender({ current: a });
    expect(result.current).toBe(3);
  });

  it('increments for path and expand signature changes, but not equivalent inputs', () => {
    const { result, rerender } = renderHook(
      ({ current }: { current: string }) => useSpotlightFitTransition(current),
      { initialProps: { current: signature({ recentWindow: 7, spotlightOn: true }) } },
    );

    rerender({ current: signature({ recentWindow: 7, spotlightOn: true }) });
    expect(result.current).toBe(0);
    rerender({ current: signature({ pathSourceSlug: 'capabilities/a', pathTargetSlug: 'elements/b' }) });
    expect(result.current).toBe(1);
    rerender({ current: signature({ pathSourceSlug: 'capabilities/a', pathTargetSlug: 'elements/c' }) });
    expect(result.current).toBe(2);
    rerender({ current: signature({ expandAllActive: true }) });
    expect(result.current).toBe(3);
  });
});
