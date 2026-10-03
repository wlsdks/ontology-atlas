import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSourceImportFeedback } from './use-source-import-feedback';
import type { AddSourcesOutcome } from '../lib/add-sources';

const result = (status: 'added' | 'duplicate' | 'failed'): AddSourcesOutcome => ({
  cancelled: false,
  results: [{ pickedName: 'file.txt', status, relativePath: status === 'failed' ? null : 'sources/file.txt', sha256: 'hash', size: 3, reason: status === 'failed' ? 'Write refused' : null }],
});
afterEach(() => vi.useRealTimers());

describe('source import feedback authority', () => {
  it('stays neutral at the picker and moves only when import actually starts', () => {
    const hook = renderHook(() => useSourceImportFeedback('folder'));
    let operation!: ReturnType<typeof hook.result.current.begin>;
    act(() => { operation = hook.result.current.begin(); });
    expect(hook.result.current.state).toBe('idle');
    act(() => operation.importing());
    expect(hook.result.current.state).toBe('working');
    act(() => operation.finish(result('added')));
    expect(hook.result.current.state).toBe('done');
  });
  it('never treats cancelled picks or duplicate-only results as new imported files', () => {
    const hook = renderHook(() => useSourceImportFeedback('folder'));
    for (const outcome of [{ cancelled: true, results: [] }, result('duplicate')]) {
      act(() => { const operation = hook.result.current.begin(); operation.importing(); operation.finish(outcome); });
      expect(hook.result.current.state).toBe('idle');
    }
  });
  it('marks partial failures as failure even when another file landed', () => {
    const hook = renderHook(() => useSourceImportFeedback('folder'));
    act(() => hook.result.current.begin().finish({ cancelled: false, results: [...result('added').results, ...result('failed').results] }));
    expect(hook.result.current.state).toBe('failed');
  });
  it('drops late feedback across folder changes including a round trip', () => {
    const hook = renderHook(({ scope }) => useSourceImportFeedback(scope), { initialProps: { scope: 'first' } });
    let operation!: ReturnType<typeof hook.result.current.begin>;
    act(() => { operation = hook.result.current.begin(); operation.importing(); });
    hook.rerender({ scope: 'second' });
    expect(hook.result.current.state).toBe('idle');
    hook.rerender({ scope: 'first' });
    act(() => { operation.importing(); operation.finish(result('added')); });
    expect(hook.result.current.state).toBe('idle');
  });
  it('keeps the latest attempt when an earlier one resolves out of order', () => {
    const hook = renderHook(() => useSourceImportFeedback('folder'));
    let first!: ReturnType<typeof hook.result.current.begin>;
    let second!: ReturnType<typeof hook.result.current.begin>;
    act(() => { first = hook.result.current.begin(); second = hook.result.current.begin(); second.importing(); });
    act(() => first.finish(result('failed')));
    expect(hook.result.current.state).toBe('working');
    act(() => second.finish(result('added')));
    expect(hook.result.current.state).toBe('done');
  });
  it('owns no late visual timer after its host unmounts', () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useSourceImportFeedback('folder'), { wrapper: StrictMode });
    let operation!: ReturnType<typeof hook.result.current.begin>;
    act(() => { operation = hook.result.current.begin(); operation.importing(); });
    hook.unmount();
    act(() => { operation.finish(result('added')); operation.fail(); });
    expect(vi.getTimerCount()).toBe(0);
  });
});
