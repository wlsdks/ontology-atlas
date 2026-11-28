import { describe, expect, it } from 'vitest';
import { architectureRoutes } from '../architecture-routes';
import { routeTreeAddresses } from '../route-tree-addresses';

const ROOT = process.cwd();

/** A route tree address as `docs/ARCHITECTURE.md` writes it: no language segment, `[segment]` for a param. */
const asDocumented = (address: string) => {
  const withoutLocale = address.replace(/^\/\$locale/, '') || '/';
  return withoutLocale.replace(/\$(\w+)/g, '[$1]');
};

/** `/` in the tree is the redirect to a language and `/$locale/$` the not-found catch-all; neither is a screen the document lists. */
const NOT_A_SCREEN = new Set(['/', '/$']);

describe('the route list in docs/ARCHITECTURE.md and the router agree', () => {
  const documented = new Set(architectureRoutes(ROOT));
  const routed = new Set([...routeTreeAddresses(ROOT)].map(asDocumented).filter((address) => !NOT_A_SCREEN.has(address)));
  // The locale index (`/$locale`) is the document's `/`.
  routed.add('/');

  it('reads both lists', () => {
    expect(documented.size).toBeGreaterThan(15);
    expect(routed.size).toBeGreaterThan(15);
  });

  it('every route the router has is documented', () => {
    expect([...routed].filter((address) => !documented.has(address))).toEqual([]);
  });

  it('every route the document lists is one the router has', () => {
    expect([...documented].filter((address) => !routed.has(address))).toEqual([]);
  });
});
