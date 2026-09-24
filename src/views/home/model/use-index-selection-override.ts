'use client';

import { useCallback, useReducer } from 'react';

export interface IndexSelectionOverrideState {
  selectionActive: boolean;
  manualExpand: boolean;
}

export type IndexSelectionOverrideAction =
  | { type: 'selection-session'; active: boolean }
  | { type: 'manual-expand' }
  | { type: 'begin-expanded-selection' };

export const INITIAL_INDEX_SELECTION_OVERRIDE: IndexSelectionOverrideState = {
  selectionActive: false,
  manualExpand: false,
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
    return { selectionActive: true, manualExpand: true };
  }
  if (action.type === 'selection-session') {
    if (action.active === state.selectionActive && !state.manualExpand) return state;
    return { selectionActive: action.active, manualExpand: false };
  }
  if (!state.selectionActive || state.manualExpand) return state;
  return { ...state, manualExpand: true };
}

/**
 * Mirrors an external selection lifecycle into the reducer before paint. The
 * guarded render update is intentionally not an effect: an effect would leave
 * the first frame of a new selection carrying the previous session's override.
 */
export function useIndexSelectionOverride(selectionActive: boolean): {
  manualExpand: boolean;
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
    markManualExpand,
    beginExpandedSelection,
  };
}
