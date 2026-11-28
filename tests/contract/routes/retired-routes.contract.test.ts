import { describe, expect, it } from 'vitest';

import { readRouteAddresses } from './read-route-addresses';

const RETIRED_FIRST_SEGMENTS = [
  'admin',
  'login',
  'signup',
  'account',
  'reset-password',
  'settings',
  'knowledge',
  'review',
  'diagnostics',
  'skills',
] as const;

describe('retired routes', () => {
  const routes = readRouteAddresses().map((route) => ({ segment: route.address.split('/')[1], file: route.file }));

  it('reads the route tree', () => {
    expect(routes.map((route) => route.segment)).toContain('topology');
  });

  it.each(RETIRED_FIRST_SEGMENTS)('serves nothing at /%s, under either layout', (name) => {
    expect(routes.filter((route) => route.segment === name).map((route) => route.file)).toEqual([]);
  });

  it('has no dynamic first segment that could serve a retired path', () => {
    expect(routes.filter((route) => route.segment.startsWith('$')).map((route) => route.file)).toEqual([]);
  });
});
