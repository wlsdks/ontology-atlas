import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAdapterDiagnostics } from './use-adapter-diagnostics';

describe('the adapter lines kept for a failure', () => {
  it('keeps trimmed lines in order and ignores blank ones', () => {
    const { result } = renderHook(() => useAdapterDiagnostics());
    act(() => {
      result.current.keepDiagnostic('  first clue  ');
      result.current.keepDiagnostic('   ');
      result.current.keepDiagnostic('second clue');
    });
    expect(result.current.diagnostics).toEqual(['first clue', 'second clue']);
  });

  it('stops at eight lines so the cause is not pushed out by install progress', () => {
    const { result } = renderHook(() => useAdapterDiagnostics());
    act(() => {
      for (let line = 1; line <= 12; line += 1) result.current.keepDiagnostic(`line ${line}`);
    });
    expect(result.current.diagnostics).toHaveLength(8);
    expect(result.current.diagnostics.at(-1)).toBe('line 8');
  });

  it('remembers a gate-off line even when the cap already dropped it, until the next start resets', () => {
    const { result } = renderHook(() => useAdapterDiagnostics());
    act(() => {
      for (let line = 1; line <= 8; line += 1) result.current.keepDiagnostic(`line ${line}`);
      result.current.keepDiagnostic('gate-off:settings');
    });
    expect(result.current.diagnostics).not.toContain('gate-off:settings');
    expect(result.current.gateOffRef.current).toBe(true);
    act(() => result.current.resetDiagnostics());
    expect(result.current.gateOffRef.current).toBe(false);
    expect(result.current.diagnostics).toEqual([]);
  });
});
