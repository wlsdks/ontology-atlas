import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  defaultViewForSurface,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
  rewriteRetiredView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the three views', () => {
    expect(parseHarnessView('overview')).toBe('overview');
    expect(parseHarnessView('guides')).toBe('guides');
    expect(parseHarnessView('architecture')).toBe('architecture');
  });

  it('opens the overview for an unknown or missing value', () => {
    expect(parseHarnessView(null)).toBe('overview');
    expect(parseHarnessView(undefined)).toBe('overview');
    expect(parseHarnessView('')).toBe('overview');
    expect(parseHarnessView('not-a-view')).toBe('overview');
    expect(parseHarnessView(null)).toBe(DEFAULT_HARNESS_VIEW);
  });

  it('sends every retired address to the overview', () => {
    expect(parseHarnessView('sensors')).toBe('overview');
    expect(parseHarnessView('structure')).toBe('overview');
    expect(parseHarnessView('coverage')).toBe('overview');
  });

  it('puts the overview first, so the tab order is the reading order', () => {
    expect(HARNESS_VIEW_ORDER[0]).toBe('overview');
    expect([...HARNESS_VIEW_ORDER]).toEqual(['overview', 'guides', 'architecture']);
  });
});

describe('rewriteRetiredView', () => {
  it('rewrites a retired view in place and keeps every other parameter', () => {
    expect(rewriteRetiredView('?view=coverage&guides=off')).toBe('?view=overview&guides=off');
    expect(rewriteRetiredView('?view=sensors')).toBe('?view=overview');
    expect(rewriteRetiredView('?role=views&view=structure')).toBe('?role=views&view=overview');
  });

  it('leaves a current or absent view alone', () => {
    expect(rewriteRetiredView('?view=guides')).toBeNull();
    expect(rewriteRetiredView('?view=overview')).toBeNull();
    expect(rewriteRetiredView('')).toBeNull();
    expect(rewriteRetiredView('?focus=main')).toBeNull();
  });
});

describe('resolveAddressView', () => {
  it('reads the blueprint out of an address that carries only its own parameters', () => {
    /* Deep links from before the overview became the default carry `?role=` without `?view=`. */
    expect(resolveAddressView(new URLSearchParams('role=views'))).toBe('architecture');
    expect(resolveAddressView(new URLSearchParams('stage=plan'))).toBe('architecture');
  });

  it('lets an explicit view win over that reading', () => {
    expect(resolveAddressView(new URLSearchParams('view=guides&role=views'))).toBe('guides');
  });

  it('opens the arrival view for a plain address or none at all', () => {
    expect(resolveAddressView(new URLSearchParams(''))).toBe('overview');
    expect(resolveAddressView(new URLSearchParams('focus=main'))).toBe('overview');
    expect(resolveAddressView(null)).toBe('overview');
  });

  it('sends a surface that cannot read the harness to the view it can answer', () => {
    expect(resolveAddressView(new URLSearchParams(''), false)).toBe('architecture');
    expect(resolveAddressView(null, false)).toBe('architecture');
    expect(resolveAddressView(new URLSearchParams('view=overview'), false)).toBe('overview');
  });
});

describe('defaultViewForSurface', () => {
  it('gives the app the harness and the browser the blueprint', () => {
    expect(defaultViewForSurface(true)).toBe('overview');
    expect(defaultViewForSurface(false)).toBe('architecture');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('overview')).toBe('/architecture/');
  });

  it('writes the view a surface does not arrive on, so a refresh reopens what was pressed', () => {
    /* On the web the plain address means the blueprint, so the overview must be written out. */
    expect(buildHarnessViewHref('overview', '/architecture/', '', 'architecture')).toBe(
      '/architecture/?view=overview',
    );
    expect(buildHarnessViewHref('overview', '/architecture/', '', 'overview')).toBe(
      '/architecture/',
    );
    expect(buildHarnessViewHref('architecture', '/architecture/', '', 'architecture')).toBe(
      '/architecture/',
    );
  });

  it('names the other views in the query', () => {
    expect(buildHarnessViewHref('guides')).toBe('/architecture/?view=guides');
    expect(buildHarnessViewHref('architecture')).toBe('/architecture/?view=architecture');
  });

  it('keeps the locale-prefixed pathname it was given', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/')).toBe('/ko/architecture/?view=guides');
  });

  it('keeps every other parameter, because the other writer of this URL does', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/', '?role=views&guides=off')).toBe(
      '/ko/architecture/?role=views&guides=off&view=guides',
    );
    expect(buildHarnessViewHref('overview', '/ko/architecture/', '?view=guides&role=views')).toBe(
      '/ko/architecture/?role=views',
    );
  });
});
