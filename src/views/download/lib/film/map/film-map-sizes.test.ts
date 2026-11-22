import { describe, expect, it } from 'vitest';

import { FILM_TEST_TOKENS } from './film-map-fixture';
import { WIDE_PX, filmSizes, litReach } from './film-map-sizes';

describe('film map sizes', () => {
  it('treats a stage from 720px wide as wide and grows its marks by the film growth', () => {
    const wide = filmSizes(WIDE_PX, 960, FILM_TEST_TOKENS);
    const narrow = filmSizes(WIDE_PX - 1, 960, FILM_TEST_TOKENS);
    expect(wide.wide).toBe(true);
    expect(narrow.wide).toBe(false);
    expect(wide.K).toBeCloseTo(FILM_TEST_TOKENS.growth * wide.s);
    expect(narrow.K).toBe(0.84);
  });

  it('scales a full stage by 1 and never below 0.74', () => {
    expect(filmSizes(1920, 960, FILM_TEST_TOKENS).s).toBe(1);
    expect(filmSizes(3000, 2000, FILM_TEST_TOKENS).s).toBe(1);
    expect(filmSizes(800, 400, FILM_TEST_TOKENS).s).toBe(0.74);
  });

  it('draws the rings of a wide stage closer under `fit`, and leaves text and phone rings alone', () => {
    const full = filmSizes(1920, 960, FILM_TEST_TOKENS);
    const tight = filmSizes(1920, 960, FILM_TEST_TOKENS, 0.5);
    expect(tight.rings).toEqual(full.rings.map((ring) => ring * 0.5));
    expect(tight.fDomain).toBe(full.fDomain);
    expect(filmSizes(402, 874, FILM_TEST_TOKENS, 0.5).rings).toEqual([38, 54, 70]);
  });

  it('reaches past a lit capability by its agent ring, the gap and the element dots', () => {
    const sizes = filmSizes(1920, 960, FILM_TEST_TOKENS);
    const small = litReach(sizes, 3);
    expect(small).toBeCloseTo(11 * sizes.K + 11 * sizes.K + 5 + sizes.elemAlt + sizes.elemR * 2);
    expect(litReach(sizes, 40)).toBeCloseTo(40 + 11 * sizes.K + 5 + sizes.elemAlt + sizes.elemR * 2);
  });
});
