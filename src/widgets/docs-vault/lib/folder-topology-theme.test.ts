import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetFolderTopologyColorCache,
  blendOverBackground,
  hashJitter,
  resolveFolderTopologyColors,
} from './folder-topology-theme';

describe('hashJitter', () => {
  it('is deterministic for the same seed', () => {
    expect(hashJitter('atlas-core', 20)).toBe(hashJitter('atlas-core', 20));
    expect(hashJitter('mcp-server', 20)).toBe(hashJitter('mcp-server', 20));
  });

  it('spreads different seeds to different values', () => {
    const a = hashJitter('atlas-core', 20);
    const b = hashJitter('mcp-server', 20);
    const c = hashJitter('cli-tooling', 20);
    // 세 값이 전부 같을 확률은 무시할 만큼 낮다 — 진짜 해시라면 갈라진다.
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it('stays within [-spread/2, spread/2)', () => {
    const seeds = ['a', 'b', 'c', 'd', 'e', 'atlas', 'ontology-atlas', 'x'.repeat(40)];
    for (const seed of seeds) {
      const v = hashJitter(seed, 20);
      expect(v).toBeGreaterThanOrEqual(-10);
      expect(v).toBeLessThan(10);
    }
  });

  it('scales with the requested spread', () => {
    const seed = 'scale-check';
    const narrow = hashJitter(seed, 4);
    const wide = hashJitter(seed, 40);
    expect(Math.abs(narrow)).toBeLessThanOrEqual(2);
    expect(Math.abs(wide)).toBeLessThanOrEqual(20);
  });
});

describe('blendOverBackground', () => {
  it('returns the background untouched for a fully-opaque overlay', () => {
    expect(blendOverBackground('rgba(139, 151, 255, 1)', '#000000')).toBe(
      'rgb(139, 151, 255)',
    );
  });

  it('returns the background untouched for a fully-transparent overlay', () => {
    expect(blendOverBackground('rgba(139, 151, 255, 0)', '#08090a')).toBe(
      'rgb(8, 9, 10)',
    );
  });

  it('alpha-composites a half-opacity overlay over an opaque background', () => {
    // rgba(255,255,255,0.5) over #000000 → rgb(128,128,128) (rounded)
    expect(blendOverBackground('rgba(255, 255, 255, 0.5)', '#000000')).toBe(
      'rgb(128, 128, 128)',
    );
  });

  it('accepts hex overlay colors', () => {
    expect(blendOverBackground('#ffffff', '#000000')).toBe('rgb(255, 255, 255)');
  });

  it('falls back to the background string when the overlay is unparseable', () => {
    expect(blendOverBackground('not-a-color', '#08090a')).toBe('#08090a');
  });
});

describe('resolveFolderTopologyColors', () => {
  beforeEach(() => {
    __resetFolderTopologyColorCache();
    document.documentElement.removeAttribute('style');
  });

  function setTokens(tokens: Record<string, string>) {
    for (const [name, value] of Object.entries(tokens)) {
      document.documentElement.style.setProperty(name, value);
    }
  }

  it('resolves opaque colors from dark-theme tokens', () => {
    setTokens({
      '--color-canvas': '#08090a',
      '--color-text-secondary': '#d0d6e0',
      '--color-text-quaternary': '#787c84',
    });
    const colors = resolveFolderTopologyColors();
    for (const value of Object.values(colors)) {
      expect(value).not.toMatch(/rgba?\([^)]*,\s*0(\.\d+)?\s*\)/);
    }
    expect(colors.label).toBe('#d0d6e0');
  });

  it('re-resolves to different opaque tones when the underlying tokens change', () => {
    setTokens({
      '--color-canvas': '#08090a',
      '--color-text-secondary': '#d0d6e0',
      '--color-text-quaternary': '#787c84',
    });
    const before = resolveFolderTopologyColors();

    setTokens({
      '--color-canvas': '#0f1011',
      '--color-text-secondary': '#c7ccd6',
      '--color-text-quaternary': '#70747c',
    });
    const after = resolveFolderTopologyColors();

    expect(after.label).toBe('#c7ccd6');
    expect(after.edgeDefault).not.toBe(before.edgeDefault);
    expect(after.nodeDim).not.toBe(before.nodeDim);
  });

  it('caches the result until the underlying tokens change', () => {
    setTokens({
      '--color-canvas': '#08090a',
      '--color-text-secondary': '#d0d6e0',
      '--color-text-quaternary': '#787c84',
    });
    const first = resolveFolderTopologyColors();
    const second = resolveFolderTopologyColors();
    expect(second).toBe(first); // 동일 참조 — 재계산 안 함
  });
});
