import { describe, expect, it } from 'vitest';
import { librarySelectionFocusTarget } from './library-selection';

describe('mobile Browse page round-trip focus', () => {
  it('returns from a Wiki reader to the visible Browse exit, then lets that exit return to the question', () => {
    const reader = document.createElement('div');
    reader.tabIndex = -1;
    const browseBack = document.createElement('button');
    document.body.append(reader, browseBack);
    try {
      const openPage = librarySelectionFocusTarget({ selected: { kind: 'wiki' }, mobileBrowseOpen: true, narrow: true, browseBack, reader });
      expect(openPage).toBe(reader);
      openPage?.focus();
      const backFromPage = librarySelectionFocusTarget({ selected: null, mobileBrowseOpen: true, narrow: true, browseBack, reader });
      expect(backFromPage).toBe(browseBack);
      backFromPage?.focus();
      expect(document.activeElement).toBe(browseBack);
      expect(librarySelectionFocusTarget({ selected: null, mobileBrowseOpen: false, narrow: true, browseBack: null, reader })).toBe(reader);
    } finally {
      reader.remove();
      browseBack.remove();
    }
  });
});
