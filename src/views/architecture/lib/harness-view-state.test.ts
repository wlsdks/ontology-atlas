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
    /* The destination is named Harness, so its arrival screen is the harness's own anatomy. The
       layer ladder it used to be is the product's architecture, under its own name and its own
       address since 2026-09-19 (owner). */
    expect(parseHarnessView(null)).toBe('structure');
    expect(parseHarnessView(undefined)).toBe('structure');
    expect(parseHarnessView('')).toBe('structure');
    expect(parseHarnessView('not-a-view')).toBe('structure');
    expect(DEFAULT_HARNESS_VIEW).toBe('structure');
  });

  it('sends the retired sensors address to the view that answers it', () => {
    /* The sensors view named exactly this question — which checks cover each domain's paths, and
       where nobody is watching — and said it was not built. A link written to it should land on the
       answer, not on the default by accident. */
    expect(parseHarnessView('sensors')).toBe('coverage');
  });

  it('puts the harness structure first, so the tab order is the reading order', () => {
    expect(HARNESS_VIEW_ORDER[0]).toBe('structure');
    expect([...HARNESS_VIEW_ORDER]).toEqual(['structure', 'coverage', 'guides', 'architecture']);
  });
});

describe('resolveAddressView', () => {
  it('reads the blueprint out of an address that carries only its own parameters', () => {
    /* `?role=` and `?stage=` exist on no other view. Every deep link written while the blueprint
       was the default carries one and no `?view=`, and would otherwise open a screen with no roles
       on it. */
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
    /* The browser cannot see a dot directory at all, so the structure view is empty there and
       arriving on it hands a web visitor a card about what this browser cannot do. */
    expect(resolveAddressView(new URLSearchParams(''), false)).toBe('architecture');
    expect(resolveAddressView(null, false)).toBe('architecture');
    /* An address still wins, so a shared link opens what it names on either surface. */
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
    /* The browser arrives on the blueprint. Dropping `?view=` for `structure` there wrote an
       address that reads back as `architecture`, so pressing the structure tab and refreshing
       reopened the ladder. */
    expect(buildHarnessViewHref('structure', '/architecture/', '', 'architecture')).toBe(
      '/architecture/?view=structure',
    );
    /* The installed app does arrive on it, so its plain address stays plain. */
    expect(buildHarnessViewHref('structure', '/architecture/', '', 'structure')).toBe(
      '/architecture/',
    );
    /* And on the web the blueprint is the one that needs no parameter. */
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
