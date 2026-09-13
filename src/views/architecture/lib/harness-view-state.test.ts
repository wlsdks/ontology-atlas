import { describe, expect, it } from 'vitest';

import {
  buildHarnessViewHref,
  DEFAULT_HARNESS_VIEW,
  parseHarnessView,
} from './harness-view-state';

describe('parseHarnessView', () => {
  it('reads the three views', () => {
    expect(parseHarnessView('coverage')).toBe('coverage');
    expect(parseHarnessView('guides')).toBe('guides');
    expect(parseHarnessView('structure')).toBe('structure');
  });

  it('opens the coverage matrix for an unknown or missing value', () => {
    expect(parseHarnessView(null)).toBe('coverage');
    expect(parseHarnessView(undefined)).toBe('coverage');
    expect(parseHarnessView('')).toBe('coverage');
    expect(parseHarnessView('architecture')).toBe('coverage');
    expect(DEFAULT_HARNESS_VIEW).toBe('coverage');
  });

  it('sends the retired sensors address to the view that answers it', () => {
    /* The sensors view named exactly this question — which checks cover each domain's paths, and
       where nobody is watching — and said it was not built. A link written to it should land on the
       answer, not on the default by accident. */
    expect(parseHarnessView('sensors')).toBe('coverage');
  });

  it('keeps a ?role= deep link on the blueprint, the only view that can show a role', () => {
    expect(parseHarnessView(null, { hasRole: true })).toBe('structure');
    /* An explicit view still wins: the address says what it says. */
    expect(parseHarnessView('guides', { hasRole: true })).toBe('guides');
  });

  it('does not treat the shell-wide ?focus=main skip anchor as a deep link', () => {
    /*
     * Measured in the installed app: every left-rail link carries `?focus=main` as its
     * skip-to-content anchor, so keying the carve-out on `focus` made one rail click on Harness
     * open the ladder and left the new default unreachable from the rail. A parameter the whole
     * shell writes cannot also be one view's deep link.
     */
    expect(parseHarnessView(null, { hasRole: false })).toBe('coverage');
  });
});

describe('buildHarnessViewHref', () => {
  it('leaves the default view at the plain address a person copies', () => {
    expect(buildHarnessViewHref('coverage')).toBe('/architecture/');
  });

  it('names the other two views in the query', () => {
    expect(buildHarnessViewHref('guides')).toBe('/architecture/?view=guides');
    expect(buildHarnessViewHref('structure')).toBe('/architecture/?view=structure');
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
    expect(buildHarnessViewHref('coverage', '/ko/architecture/', '?view=structure&role=views')).toBe(
      '/ko/architecture/?role=views',
    );
  });
});
