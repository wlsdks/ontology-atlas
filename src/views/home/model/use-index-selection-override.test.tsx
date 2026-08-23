import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  indexSelectionOverrideReducer,
  INITIAL_INDEX_SELECTION_OVERRIDE,
  useIndexSelectionOverride,
} from './use-index-selection-override';

describe('indexSelectionOverrideReducer', () => {
  it('allows manual expansion only inside an active selection session', () => {
    expect(
      indexSelectionOverrideReducer(INITIAL_INDEX_SELECTION_OVERRIDE, { type: 'manual-expand' }),
    ).toBe(INITIAL_INDEX_SELECTION_OVERRIDE);

    const active = indexSelectionOverrideReducer(INITIAL_INDEX_SELECTION_OVERRIDE, {
      type: 'selection-session',
      active: true,
    });
    expect(indexSelectionOverrideReducer(active, { type: 'manual-expand' })).toEqual({
      selectionActive: true,
      manualExpand: true,
    });
  });
});

describe('useIndexSelectionOverride', () => {
  it('can start an INDEX-originated selection expanded after the selection is published', () => {
    const { result, rerender } = renderHook(
      ({ selectionActive }) => useIndexSelectionOverride(selectionActive),
      { initialProps: { selectionActive: false } },
    );

    rerender({ selectionActive: true });
    act(() => result.current.beginExpandedSelection());

    expect(result.current.manualExpand).toBe(true);
  });

  it('clears a manual expansion when selection ends and does not inherit it into the next session', () => {
    const { result, rerender } = renderHook(
      ({ selectionActive }) => useIndexSelectionOverride(selectionActive),
      { initialProps: { selectionActive: false } },
    );

    rerender({ selectionActive: true });
    expect(result.current.manualExpand).toBe(false);
    act(() => result.current.markManualExpand());
    expect(result.current.manualExpand).toBe(true);

    rerender({ selectionActive: false });
    expect(result.current.manualExpand).toBe(false);

    rerender({ selectionActive: true });
    expect(result.current.manualExpand).toBe(false);
  });
});
