import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  parseHarnessView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the three views', () => {
    expect(parseHarnessView('guides')).toBe('guides');
    expect(parseHarnessView('structure')).toBe('structure');
    expect(parseHarnessView('sensors')).toBe('sensors');
  });

  it('lands an unknown or missing value on the blueprint, where every old link already pointed', () => {
    expect(parseHarnessView(null)).toBe('structure');
    expect(parseHarnessView(undefined)).toBe('structure');
    expect(parseHarnessView('')).toBe('structure');
    expect(parseHarnessView('architecture')).toBe('structure');
    expect(DEFAULT_HARNESS_VIEW).toBe('structure');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('structure')).toBe('/architecture/');
  });

  it('names the other two views in the query', () => {
    expect(buildHarnessViewHref('guides')).toBe('/architecture/?view=guides');
    expect(buildHarnessViewHref('sensors')).toBe('/architecture/?view=sensors');
  });

  it('keeps the locale-prefixed pathname it was given', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/')).toBe('/ko/architecture/?view=guides');
  });
});
