import { describe, expect, it } from 'vitest';

import {
  isGatewayRoute,
  resolveActiveNavDestination,
  stripLocalePrefix,
} from './nav-destination';

const FOUR = ['en', 'ko', 'ja', 'zh'];

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
    expect(isGatewayRoute('/en/download/')).toBe(true);
  });
});
