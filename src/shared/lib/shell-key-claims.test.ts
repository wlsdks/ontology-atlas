import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { readShellKeyClaimed, useClaimShellKey, useShellKeyClaimed } from './shell-key-claims';

describe('shell key claims', () => {
  it('stands the shell aside only while a claiming screen is mounted', () => {
    const shell = renderHook(() => useShellKeyClaimed('search'));
    expect(shell.result.current).toBe(false);

    const screen = renderHook(() => useClaimShellKey('search'));
    expect(shell.result.current).toBe(true);
    // A claim on one key is not a claim on the other.
    expect(readShellKeyClaimed('shortcuts')).toBe(false);

    act(() => screen.unmount());
    expect(shell.result.current).toBe(false);
  });

  it('keeps the claim until the last of two holders leaves', () => {
    const first = renderHook(() => useClaimShellKey('shortcuts'));
    const second = renderHook(() => useClaimShellKey('shortcuts'));
    expect(readShellKeyClaimed('shortcuts')).toBe(true);

    first.unmount();
    expect(readShellKeyClaimed('shortcuts')).toBe(true);
    second.unmount();
    expect(readShellKeyClaimed('shortcuts')).toBe(false);
  });

  it('claims nothing while inactive, and releases when it turns inactive', () => {
    const holder = renderHook(({ active }) => useClaimShellKey('search', active), {
      initialProps: { active: false },
    });
    expect(readShellKeyClaimed('search')).toBe(false);

    holder.rerender({ active: true });
    expect(readShellKeyClaimed('search')).toBe(true);
    holder.rerender({ active: false });
    expect(readShellKeyClaimed('search')).toBe(false);
    holder.unmount();
  });
});
