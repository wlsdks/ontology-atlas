import { describe, it, expect } from 'vitest';
import { createLayoutEngine } from './layout-engine';

function tickUntilInactive(engine: ReturnType<typeof createLayoutEngine>, limit = 300) {
  for (let i = 0; i < limit && engine.isActive(); i++) {
    engine.tickToArrays();
  }
}

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

  it('wakes a settled simulation when a held node moves after a long pause', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 50, y: 50, size: 4 },
      ],
      links: [{ source: 'a', target: 'b' }],
      autoStart: false,
      initialAlpha: 0.3,
    });
    engine.pin('a', 10, 10);
    tickUntilInactive(engine);
    expect(engine.isActive()).toBe(false);

    engine.drag('a', 80, 90);

    expect(engine.isActive()).toBe(true);
    const out = engine.tickToArrays();
    expect(out.x[0]).toBeCloseTo(80, 3);
    expect(out.y[0]).toBeCloseTo(90, 3);
  });

  it('moves a dragged group in the same simulation tick', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 50, y: 50, size: 4 },
        { id: 'c', x: -50, y: -50, size: 4 },
      ],
      links: [
        { source: 'a', target: 'b' },
        { source: 'a', target: 'c' },
      ],
      autoStart: false,
      initialAlpha: 0.3,
    });

    engine.pinGroup([
      { id: 'a', x: 10, y: 20 },
      { id: 'b', x: 60, y: 70 },
    ]);
    tickUntilInactive(engine);
    expect(engine.isActive()).toBe(false);

    engine.dragGroup([
      { id: 'a', x: 30, y: 40 },
      { id: 'b', x: 80, y: 90 },
    ]);

    const out = engine.tickToArrays();
    expect(out.x[0]).toBeCloseTo(30, 3);
    expect(out.y[0]).toBeCloseTo(40, 3);
    expect(out.x[1]).toBeCloseTo(80, 3);
    expect(out.y[1]).toBeCloseTo(90, 3);
    expect(engine.isActive()).toBe(true);
  });

  it('wakes a settled simulation when a held node is released', () => {
    const engine = createLayoutEngine();
    engine.init({
      nodes: [
        { id: 'a', x: 0, y: 0, size: 4 },
        { id: 'b', x: 50, y: 50, size: 4 },
      ],
      links: [{ source: 'a', target: 'b' }],
      autoStart: false,
      initialAlpha: 0.3,
    });
    engine.pin('a', 10, 10);
    tickUntilInactive(engine);
    expect(engine.isActive()).toBe(false);

    engine.release('a');

    expect(engine.isActive()).toBe(true);
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
