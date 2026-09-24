'use client';

import { useCallback, useReducer } from 'react';

export interface IndexSelectionOverrideState {
  selectionActive: boolean;
  manualExpand: boolean;
  /**
   * The expansion came from the person pressing the folded tab during this selection, not from
   * picking the row in INDEX. On a crowded window only this one outranks the automatic fold.
   */
  byTab: boolean;
}

export type IndexSelectionOverrideAction =
  | { type: 'selection-session'; active: boolean }
  | { type: 'manual-expand' }
  | { type: 'begin-expanded-selection' };

export const INITIAL_INDEX_SELECTION_OVERRIDE: IndexSelectionOverrideState = {
  selectionActive: false,
  manualExpand: false,
  byTab: false,
};

/**
 * A selection-local override: expanding INDEX is an interaction within one
 * active selection, never a persisted preference. Both ending and beginning a
 * session clear it so a later selection cannot inherit the previous one.
 */
export function indexSelectionOverrideReducer(
  state: IndexSelectionOverrideState,
  action: IndexSelectionOverrideAction,
): IndexSelectionOverrideState {
  if (action.type === 'begin-expanded-selection') {
    return { selectionActive: true, manualExpand: true, byTab: false };
  }
  if (action.type === 'selection-session') {
    if (action.active === state.selectionActive && !state.manualExpand) return state;
    return { selectionActive: action.active, manualExpand: false, byTab: false };
  }
  if (!state.selectionActive || (state.manualExpand && state.byTab)) return state;
  return { ...state, manualExpand: true, byTab: true };
}

/**
 * Mirrors an external selection lifecycle into the reducer before paint. The
 * guarded render update is intentionally not an effect: an effect would leave
 * the first frame of a new selection carrying the previous session's override.
 */
export function useIndexSelectionOverride(selectionActive: boolean): {
  manualExpand: boolean;
  /** `manualExpand`, counted only when the folded tab was pressed during this selection. */
  manualExpandByTab: boolean;
  markManualExpand: () => void;
  beginExpandedSelection: () => void;
} {
  const [state, dispatch] = useReducer(
    indexSelectionOverrideReducer,
    INITIAL_INDEX_SELECTION_OVERRIDE,
  );
  if (state.selectionActive !== selectionActive) {
    dispatch({ type: 'selection-session', active: selectionActive });
  }

  const markManualExpand = useCallback(() => {
    dispatch({ type: 'manual-expand' });
  }, []);
  const beginExpandedSelection = useCallback(() => {
    dispatch({ type: 'begin-expanded-selection' });
  }, []);

  return {
    manualExpand: selectionActive && state.selectionActive ? state.manualExpand : false,
    manualExpandByTab: selectionActive && state.selectionActive ? state.manualExpand && state.byTab : false,
    markManualExpand,
    beginExpandedSelection,
  };
}
