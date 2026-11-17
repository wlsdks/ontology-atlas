import { describe, expect, it } from 'vitest';

import { linkPressSwapsPane, type PaneLinkPress } from './pane-link';

const PLAIN: PaneLinkPress = { defaultPrevented: false, button: 0, modified: false, target: '', download: false, insidePane: true };

describe('which link presses crossfade the pane', () => {
  it('crossfades a plain press in the pane that leads to another screen', () => {
    expect(linkPressSwapsPane(PLAIN, '/projects/detail/?slug=atlas', '/projects')).toBe(true);
    expect(linkPressSwapsPane(PLAIN, '/docs/', '/library/')).toBe(true);
  });

  it.each([
    ['a change of query on the same screen', '/library/?tab=wiki', '/library'],
    ['the same screen written with a trailing slash', '/library/', '/library'],
    ['a hash on the current screen', '#details', '/library'],
    ['an address outside the app', 'https://example.com/', '/library'],
    ['the map, which arrives through its own overlay', '/topology/?focus=checkout', '/projects'],
  ])('leaves %s to the link', (_label, href, pathname) => {
    expect(linkPressSwapsPane(PLAIN, href, pathname)).toBe(false);
  });

  it.each([
    ['a press something already handled', { defaultPrevented: true }],
    ['a middle click', { button: 1 }],
    ['a modifier click', { modified: true }],
    ['a link that opens another tab', { target: '_blank' }],
    ['a download', { download: true }],
    ['a link in an overlay above the pane', { insidePane: false }],
  ] as const)('leaves %s to the link', (_label, change) => {
    expect(linkPressSwapsPane({ ...PLAIN, ...change }, '/docs/', '/library')).toBe(false);
  });
});
