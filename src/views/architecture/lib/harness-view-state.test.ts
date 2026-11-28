import { parseSearch } from '@/shared/lib/navigation/atlas-search';
import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
  resolveAddressView,
  rewriteRetiredView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the two views', () => {
    expect(parseHarnessView('overview')).toBe('overview');
    expect(parseHarnessView('architecture')).toBe('architecture');
  });

  it('opens the overview for an unknown or missing value', () => {
    expect(parseHarnessView(null)).toBe('overview');
    expect(parseHarnessView(undefined)).toBe('overview');
    expect(parseHarnessView('')).toBe('overview');
    expect(parseHarnessView('not-a-view')).toBe('overview');
    // A name every object inherits is not a retired view.
    expect(parseHarnessView('constructor')).toBe('overview');
    expect(rewriteRetiredView('?view=toString')).toBeNull();
    expect(parseHarnessView(null)).toBe(DEFAULT_HARNESS_VIEW);
  });

  it('sends every retired address to the overview', () => {
    expect(parseHarnessView('sensors')).toBe('overview');
    expect(parseHarnessView('structure')).toBe('overview');
    expect(parseHarnessView('coverage')).toBe('overview');
    expect(parseHarnessView('guides')).toBe('overview');
  });

  it('puts the overview first, so the tab order is the reading order', () => {
    expect(HARNESS_VIEW_ORDER[0]).toBe('overview');
    expect([...HARNESS_VIEW_ORDER]).toEqual(['overview', 'architecture']);
  });
});

describe('rewriteRetiredView', () => {
  it('rewrites a retired view in place and keeps every other parameter', () => {
    expect(rewriteRetiredView('?view=coverage&guides=off')).toBe('?view=overview&guides=off');
    expect(rewriteRetiredView('?view=sensors')).toBe('?view=overview');
    expect(rewriteRetiredView('?role=views&view=structure')).toBe('?role=views&view=overview');
    expect(rewriteRetiredView('?view=guides')).toBe('?view=overview');
  });

  it('leaves a current or absent view alone', () => {
    expect(rewriteRetiredView('?view=overview')).toBeNull();
    expect(rewriteRetiredView('')).toBeNull();
    expect(rewriteRetiredView('?focus=main')).toBeNull();
  });
});

describe('resolveAddressView', () => {
  it('reads the blueprint out of an address that carries only its own parameters', () => {
    /* Deep links from before the overview became the default carry `?role=` without `?view=`. */
    expect(resolveAddressView(parseSearch('role=views'))).toBe('architecture');
    expect(resolveAddressView(parseSearch('stage=plan'))).toBe('architecture');
  });

  it('lets an explicit view win over that reading', () => {
    expect(resolveAddressView(parseSearch('view=overview&role=views'))).toBe('overview');
  });

  it('opens the arrival view for a plain address or none at all', () => {
    expect(resolveAddressView(parseSearch(''))).toBe('overview');
    expect(resolveAddressView(parseSearch('focus=main'))).toBe('overview');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('overview')).toBe('/architecture/');
  });

  it('names the other views in the query', () => {
    expect(buildHarnessViewHref('architecture')).toBe('/architecture/?view=architecture');
  });

  it('keeps the locale-prefixed pathname it was given', () => {
    expect(buildHarnessViewHref('architecture', '/ko/architecture/')).toBe('/ko/architecture/?view=architecture');
  });

  it('keeps every other parameter, because the other writer of this URL does', () => {
    expect(buildHarnessViewHref('architecture', '/ko/architecture/', '?role=views&guides=off')).toBe(
      '/ko/architecture/?role=views&guides=off&view=architecture',
    );
    expect(buildHarnessViewHref('overview', '/ko/architecture/', '?view=architecture&role=views')).toBe(
      '/ko/architecture/?role=views',
    );
  });
});
