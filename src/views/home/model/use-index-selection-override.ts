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
 * Expanding INDEX belongs to one selection, never a preference; session start and end both clear
 * it.
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
 * Updated during render, not in an effect, or a new selection's first frame inherits the old
 * override.
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
