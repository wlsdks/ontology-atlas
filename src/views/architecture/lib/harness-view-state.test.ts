import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  HARNESS_VIEW_ORDER,
  parseHarnessView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the three views', () => {
    expect(parseHarnessView('coverage')).toBe('coverage');
    expect(parseHarnessView('guides')).toBe('guides');
    expect(parseHarnessView('structure')).toBe('structure');
  });

  it('opens the blueprint for an unknown or missing value, where every older link points', () => {
    expect(parseHarnessView(null)).toBe('structure');
    expect(parseHarnessView(undefined)).toBe('structure');
    expect(parseHarnessView('')).toBe('structure');
    expect(parseHarnessView('architecture')).toBe('structure');
    expect(DEFAULT_HARNESS_VIEW).toBe('structure');
  });

  it('sends the retired sensors address to the view that answers it', () => {
    /* The sensors view named exactly this question — which checks cover each domain's paths, and
       where nobody is watching — and said it was not built. A link written to it should land on the
       answer, not on the default by accident. */
    expect(parseHarnessView('sensors')).toBe('coverage');
  });

  it('puts the blueprint first, so the tab order is the reading order', () => {
    expect(HARNESS_VIEW_ORDER[0]).toBe('structure');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('structure')).toBe('/architecture/');
  });

  it('names the other two views in the query', () => {
    expect(buildHarnessViewHref('guides')).toBe('/architecture/?view=guides');
    expect(buildHarnessViewHref('coverage')).toBe('/architecture/?view=coverage');
  });

  it('keeps the locale-prefixed pathname it was given', () => {
    expect(buildHarnessViewHref('guides', '/ko/architecture/')).toBe('/ko/architecture/?view=guides');
  });

  it('keeps every other parameter, because the other writer of this URL does', () => {
    /* `buildArchitectureHref` preserves the route's orthogonal flags; building the address from
       scratch here erased them, so one tab round trip silently discarded a chosen role — and a
       `replaceState` meant Back could not bring it back either. */
    expect(buildHarnessViewHref('guides', '/ko/architecture/', '?role=views&guides=off')).toBe(
      '/ko/architecture/?role=views&guides=off&view=guides',
    );
    expect(buildHarnessViewHref('structure', '/ko/architecture/', '?view=coverage&role=views')).toBe(
      '/ko/architecture/?role=views',
    );
  });
});
