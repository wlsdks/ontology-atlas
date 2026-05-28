import { describe, it, expect } from 'vitest';
import { createLayoutEngine } from './layout-engine';

describe('layout-engine', () => {
  it('returns stable index-ordered positions after init', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 10, y: 0, size: 4 },
      ],
      links: [{ source: 'a', target: 'b' }],
      autoStart: false,
      initialAlpha: 0.3,
    });
    const out = engine.tickToArrays();
    expect(out.x).toBeInstanceOf(Float32Array);
    expect(out.x.length).toBe(2);
    expect(out.y.length).toBe(2);
    expect(Number.isFinite(out.x[0])).toBe(true);
    expect(engine.ids()).toEqual(['a', 'b']);
  });

  it('pins a node to fx/fy so its position is held', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 50, y: 50, size: 4 },
      ],
      links: [{ source: 'a', target: 'b' }],
      autoStart: true,
      initialAlpha: 0.8,
    });
    engine.pin('a', 123, 456);
    for (let i = 0; i < 30; i++) engine.tickToArrays();
    const out = engine.tickToArrays();
    expect(out.x[0]).toBeCloseTo(123, 3);
    expect(out.y[0]).toBeCloseTo(456, 3);
  });

  it('release clears the pin', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [{ id: 'a', x: 0, y: 0, size: 4 }],
      links: [],
      autoStart: false,
      initialAlpha: 0.3,
    });
    engine.pin('a', 5, 5);
    engine.release('a');
    expect(engine.tickToArrays().x.length).toBe(1);
  });

  it('reheat does not throw and keeps node count', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 9, y: 9, size: 4 },
      ],
      links: [],
      autoStart: false,
      initialAlpha: 0.2,
    });
    engine.reheat();
    expect(engine.tickToArrays().x.length).toBe(2);
  });
});
