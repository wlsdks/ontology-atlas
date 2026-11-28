import { describe, expect, it } from 'vitest';

import { withLocale, withoutLocale, withPathSlash } from './locale-address';

describe('locale-aware in-app addresses', () => {
  it('prefixes the language to an in-app path and leaves other text alone', () => {
    expect(withLocale('/library/?q=a%20b#h', 'ko')).toBe('/ko/library/?q=a%20b#h');
    expect(withLocale('/', 'en')).toBe('/en/');
    expect(withLocale('https://example.com/x', 'ko')).toBe('https://example.com/x');
    expect(withLocale('//example.com/x', 'ko')).toBe('//example.com/x');
  });

  it('ends the path with a slash without touching query or hash bytes', () => {
    expect(withPathSlash('/en/library?q=a%20b#h')).toBe('/en/library/?q=a%20b#h');
    expect(withPathSlash('/en/library/?p=1')).toBe('/en/library/?p=1');
  });

  it('drops only a leading language segment', () => {
    expect(withoutLocale('/ko/library/')).toBe('/library/');
    expect(withoutLocale('/library/ko/')).toBe('/library/ko/');
  });
});
