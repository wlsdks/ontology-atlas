import { describe, expect, it } from 'vitest';

import { SETTINGS_SECTIONS } from '@/widgets/app-settings-menu/model/settings-sections';

import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

type Bundle = Record<string, unknown>;

/*
 * The set of `section.*` keys in messages must equal the set of items the menu renders, so a
 * translation left behind after removing a section is caught.
 *
 * No guidance string points at a settings section by name any more (the card that did lived in the
 * browser's runtimes pane), so the old check that every named section exists has nothing to read;
 * reinstate it with the first new instruction that says "go to the 「X」 section".
 */
describe('every section.* key is a section that is really drawn', () => {
  const renderedItems = [...SETTINGS_SECTIONS];

  it('the items extraction does not spin idle, since with 0 the checks below measure nothing', () => {
    expect(renderedItems.length).toBeGreaterThan(5);
  });

  it.each([
    ['ko', ko as unknown as Bundle],
    ['en', en as unknown as Bundle],
  ])('the section.* key set of %s == SETTINGS_SECTIONS', (_locale, bundle) => {
    const nav = (bundle.nav as Bundle | undefined)?.settingsMenu as Bundle | undefined;
    const keys = Object.keys((nav?.section as Record<string, string>) ?? {}).sort();
    expect(keys).toEqual([...renderedItems].sort());
  });
});
