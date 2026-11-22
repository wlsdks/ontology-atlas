import { describe, expect, it } from 'vitest';
import { saveStatusOf } from './save-status';

const idle = { saving: false, dirty: false, savedFlash: false, draftSavedAt: null };

describe('saveStatusOf', () => {
  it('is clean with nothing to say', () => {
    expect(saveStatusOf(idle)).toMatchObject({ tone: 'clean', labelKey: 'clean' });
  });

  it('flashes saved after a write', () => {
    expect(saveStatusOf({ ...idle, savedFlash: true })).toMatchObject({ tone: 'saved', labelKey: 'saved' });
  });

  it('says dirty until a draft is kept, then says the draft is kept', () => {
    expect(saveStatusOf({ ...idle, dirty: true })).toMatchObject({ tone: 'dirty', labelKey: 'dirty' });
    expect(saveStatusOf({ ...idle, dirty: true, draftSavedAt: 5 })).toMatchObject({
      tone: 'dirty',
      labelKey: 'draftSaved',
      bodyKey: 'draftSavedDetail',
    });
  });

  it('lets a write in flight outrank unsaved edits and the saved flash', () => {
    expect(saveStatusOf({ saving: true, dirty: true, savedFlash: true, draftSavedAt: 5 }).tone).toBe('saving');
  });

  it('lets unsaved edits outrank a stale saved flash', () => {
    expect(saveStatusOf({ ...idle, dirty: true, savedFlash: true }).tone).toBe('dirty');
  });
});
