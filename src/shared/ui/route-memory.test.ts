import { describe, expect, it } from 'vitest';
import { buildRestorableRoute, isRestorableRoute } from './route-memory';

describe('RouteMemory', () => {
  it('accepts only work surfaces under a locale as restorable', () => {
    expect(isRestorableRoute('/en/topology/')).toBe(true);
    expect(isRestorableRoute('/ko/ontology/')).toBe(true);
    expect(isRestorableRoute('/en/docs')).toBe(true);
  });

  it('rejects a locale root and external URL shapes', () => {
    expect(isRestorableRoute('/en/')).toBe(false);
    expect(isRestorableRoute('/ko/')).toBe(false);
    expect(isRestorableRoute('/topology/')).toBe(false);
    expect(isRestorableRoute('//example.com')).toBe(false);
    expect(isRestorableRoute('https://example.com/en/topology/')).toBe(false);
    expect(isRestorableRoute('/en/<script>')).toBe(false);
  });

  it('keeps the query and hash of the last position on the same surface', () => {
    expect(
      buildRestorableRoute(
        '/ko/docs/',
        '?slug=capabilities%2Fexample-capability',
        '#relations',
      ),
    ).toBe(
      '/ko/docs/?slug=capabilities%2Fexample-capability#relations',
    );
  });

  it('returns null instead of attaching a query or hash to an unrestorable pathname', () => {
    expect(buildRestorableRoute('/ko/', '?slug=README', '')).toBeNull();
    expect(
      buildRestorableRoute('https://example.com/ko/docs/', '?slug=README', ''),
    ).toBeNull();
  });
});
