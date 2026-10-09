import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '..', '..', 'app');
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

const isUrlless = (name: string) => name === '[locale]' || /^\(.*\)$/.test(name) || name.startsWith('@') || name.startsWith('_');

function firstUrlSegments(dir = APP, path: string[] = []): { segment: string; path: string }[] {
  const found: { segment: string; path: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'styles') continue;
    const next = [...path, entry.name];
    if (isUrlless(entry.name)) found.push(...firstUrlSegments(join(dir, entry.name), next));
    else found.push({ segment: entry.name, path: ['app', ...next].join('/') });
  }
  return found;
}

describe('retired routes', () => {
  const segments = firstUrlSegments();

  it('reads the route tree', () => {
    expect(segments.map((s) => s.segment)).toContain('topology');
  });

  it.each(RETIRED_FIRST_SEGMENTS)('serves nothing at /%s, through a route group or not', (name) => {
    expect(segments.filter((s) => s.segment === name).map((s) => s.path)).toEqual([]);
  });

  it('has no dynamic first segment that could serve a retired path', () => {
    expect(segments.filter((s) => s.segment.startsWith('[')).map((s) => s.path)).toEqual([]);
  });
});
