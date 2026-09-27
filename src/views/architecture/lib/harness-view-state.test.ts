import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  defaultViewForSurface,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the four views', () => {
    expect(parseHarnessView('coverage')).toBe('coverage');
    expect(parseHarnessView('guides')).toBe('guides');
    expect(parseHarnessView('structure')).toBe('structure');
    expect(parseHarnessView('architecture')).toBe('architecture');
  });

  it('opens the harness structure for an unknown or missing value', () => {
    expect(parseHarnessView(null)).toBe('structure');
    expect(parseHarnessView(undefined)).toBe('structure');
    expect(parseHarnessView('')).toBe('structure');
    expect(parseHarnessView('not-a-view')).toBe('structure');
    expect(parseHarnessView(null)).toBe(DEFAULT_HARNESS_VIEW);
  });

  it('sends the retired sensors address to the view that answers it', () => {
    expect(parseHarnessView('sensors')).toBe('coverage');
  });

  it('puts the harness structure first, so the tab order is the reading order', () => {
    expect(HARNESS_VIEW_ORDER[0]).toBe('structure');
    expect([...HARNESS_VIEW_ORDER]).toEqual(['structure', 'coverage', 'guides', 'architecture']);
  });
});

describe('resolveAddressView', () => {
  it('reads the blueprint out of an address that carries only its own parameters', () => {
    /* Deep links from before the anatomy became the default carry `?role=` without `?view=`. */
    expect(resolveAddressView(new URLSearchParams('role=views'))).toBe('architecture');
    expect(resolveAddressView(new URLSearchParams('stage=plan'))).toBe('architecture');
  });

  it('lets an explicit view win over that reading', () => {
    expect(resolveAddressView(new URLSearchParams('view=coverage&role=views'))).toBe('coverage');
  });

  it('opens the arrival view for a plain address or none at all', () => {
    expect(resolveAddressView(new URLSearchParams(''))).toBe('structure');
    expect(resolveAddressView(new URLSearchParams('focus=main'))).toBe('structure');
    expect(resolveAddressView(null)).toBe('structure');
  });

  it('sends a surface that cannot read the harness to the view it can answer', () => {
    expect(resolveAddressView(new URLSearchParams(''), false)).toBe('architecture');
    expect(resolveAddressView(null, false)).toBe('architecture');
    expect(resolveAddressView(new URLSearchParams('view=structure'), false)).toBe('structure');
  });
});

describe('defaultViewForSurface', () => {
  it('gives the app the harness and the browser the blueprint', () => {
    expect(defaultViewForSurface(true)).toBe('structure');
    expect(defaultViewForSurface(false)).toBe('architecture');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('structure')).toBe('/architecture/');
  });

  it('writes the view a surface does not arrive on, so a refresh reopens what was pressed', () => {
    /* On the web the plain address means the blueprint, so structure must be written out. */
    expect(buildHarnessViewHref('structure', '/architecture/', '', 'architecture')).toBe(
      '/architecture/?view=structure',
    );
    expect(buildHarnessViewHref('structure', '/architecture/', '', 'structure')).toBe(
      '/architecture/',
    );
    expect(buildHarnessViewHref('architecture', '/architecture/', '', 'architecture')).toBe(
      '/architecture/',
    );
  });

  it('names the other three views in the query', () => {
    expect(buildHarnessViewHref('guides')).toBe('/architecture/?view=guides');
    expect(buildHarnessViewHref('coverage')).toBe('/architecture/?view=coverage');
    expect(buildHarnessViewHref('architecture')).toBe('/architecture/?view=architecture');
  });

  it('keeps the locale-prefixed pathname it was given', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/')).toBe('/ko/architecture/?view=guides');
  });

  it('keeps every other parameter, because the other writer of this URL does', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/', '?role=views&guides=off')).toBe(
      '/ko/architecture/?role=views&guides=off&view=guides',
    );
    expect(buildHarnessViewHref('structure', '/ko/architecture/', '?view=coverage&role=views')).toBe(
      '/ko/architecture/?role=views',
    );
  });
});
