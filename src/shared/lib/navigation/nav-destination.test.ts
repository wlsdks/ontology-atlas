import { describe, expect, it } from 'vitest';

import {
  isGatewayRoute,
  keepsRoute,
  resolveActiveNavDestination,
  stripLocalePrefix,
} from './nav-destination';

const FOUR = ['en', 'ko', 'ja', 'zh'];

describe('keepsRoute: a route crossfade settles only on a pathname change', () => {
  it('keeps the route when only the query, the hash, the locale prefix or a trailing slash differ', () => {
    expect(keepsRoute('/topology/?focus=main', '/en/topology/')).toBe(true);
    expect(keepsRoute('/library/?tab=ontology&slug=a', '/ko/library')).toBe(true);
    expect(keepsRoute('/git#log', '/git/')).toBe(true);
    expect(keepsRoute('?tab=sources', '/en/library/')).toBe(true);
    expect(keepsRoute('#top', '/en/library/')).toBe(true);
    expect(keepsRoute('/', '/en')).toBe(true);
  });

  it('leaves the route for another pathname, including one that shares a prefix', () => {
    expect(keepsRoute('/architecture/?focus=main', '/en/topology/')).toBe(false);
    expect(keepsRoute('/project/fallback/?slug=launch', '/en/projects/')).toBe(false);
    expect(keepsRoute('/project/fallback/edit/', '/en/project/fallback/')).toBe(false);
    expect(keepsRoute('/topology/', '/en/')).toBe(false);
  });
});

describe('stripLocalePrefix', () => {
  it('strips any listed locale and nothing else', () => {
    expect(stripLocalePrefix('/ja/docs/', FOUR)).toBe('/docs/');
    expect(stripLocalePrefix('/zh', FOUR)).toBe('/');
    expect(stripLocalePrefix('/zh/', FOUR)).toBe('/');
    expect(stripLocalePrefix('/jazz/docs', FOUR)).toBe('/jazz/docs');
    expect(stripLocalePrefix('/fr/docs', FOUR)).toBe('/fr/docs');
    expect(stripLocalePrefix('', FOUR)).toBe('/');
  });

  it('defaults to the routing locales', () => {
    expect(stripLocalePrefix('/ko/git')).toBe('/git');
    expect(stripLocalePrefix('/en')).toBe('/');
    expect(stripLocalePrefix('/ja/git')).toBe('/git');
    expect(stripLocalePrefix('/fr/git')).toBe('/fr/git');
  });

  it('is used by the ladders it feeds', () => {
    expect(resolveActiveNavDestination('/ko/git/')).toBe('git');
    expect(resolveActiveNavDestination('/ko/planning/')).toBe('planning');
    expect(isGatewayRoute('/en/download/')).toBe(true);
  });
});
