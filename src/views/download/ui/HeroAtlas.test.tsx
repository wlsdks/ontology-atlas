import { describe, expect, it } from 'vitest';
import { rendererOptions } from '../lib/hero-atlas-scene';

/** The hero's WebGL context keeps its drawing buffer only where a spec reads the pixels back. */
describe('HeroAtlas renderer', () => {
  it('drops the drawing buffer on an ordinary visit', () => {
    expect(rendererOptions('').preserveDrawingBuffer).toBe(false);
    expect(rendererOptions('?hero=three').preserveDrawingBuffer).toBe(false);
  });

  it('keeps it under ?e2e=1, for download-gateway-grid.spec.ts', () => {
    expect(rendererOptions('?hero=three&e2e=1').preserveDrawingBuffer).toBe(true);
  });
});
