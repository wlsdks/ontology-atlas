export interface SaveStatus {
  tone: 'saving' | 'dirty' | 'saved' | 'clean';
  labelKey: 'saving' | 'draftSaved' | 'dirty' | 'saved' | 'clean';
  bodyKey: 'savingDetail' | 'draftSavedDetail' | 'dirtyDetail' | 'savedDetail' | 'cleanDetail';
}

/** The save indicator's state: a write in flight outranks unsaved edits, which outrank the saved flash. */
export function saveStatusOf(input: {
  saving: boolean;
  dirty: boolean;
  savedFlash: boolean;
  draftSavedAt: number | null;
}): SaveStatus {
  if (input.saving) return { tone: 'saving', labelKey: 'saving', bodyKey: 'savingDetail' };
  if (input.dirty) {
    return input.draftSavedAt
      ? { tone: 'dirty', labelKey: 'draftSaved', bodyKey: 'draftSavedDetail' }
      : { tone: 'dirty', labelKey: 'dirty', bodyKey: 'dirtyDetail' };
  }
  if (input.savedFlash) return { tone: 'saved', labelKey: 'saved', bodyKey: 'savedDetail' };
  return { tone: 'clean', labelKey: 'clean', bodyKey: 'cleanDetail' };
}
