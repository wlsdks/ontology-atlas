import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibrarySynapseField } from './LibrarySynapseField';

const state = vi.hoisted(() => ({ asleep: false, step: vi.fn() }));
vi.mock('@/widgets/ontology-map', () => ({
  ambientSleepFactor: () => state.asleep ? 0 : 1,
  isAmbientAsleep: (factor: number) => factor === 0,
}));
vi.mock('@/shared/lib/use-prefers-reduced-motion', () => ({ usePrefersReducedMotion: () => false }));
vi.mock('../../expressive/synapse-field', () => ({
  createSynapseField: () => [], synapseLinks: () => [], stepSynapseField: state.step,
}));

describe('LibrarySynapseField frame ownership', () => {
  let now: number;
  let callbacks: Map<number, FrameRequestCallback>;
  function frame(time: number) {
    now = time;
    const pending = [...callbacks.values()];
    callbacks.clear();
    for (const callback of pending) callback(time);
  }
  beforeEach(() => {
    now = 0;
    callbacks = new Map();
    let id = 0;
    state.asleep = false;
    state.step.mockClear();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.set(++id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => { callbacks.delete(key); });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(), clearRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  for (const fps of [60, 120]) {
    it(`parks asleep and resumes without consuming idle time at ${fps} fps`, () => {
      render(<LibrarySynapseField />);
      const interval = 1000 / fps;
      frame(interval);
      state.asleep = true;
      frame(interval * 2);
      expect(callbacks.size).toBe(0);
      const steps = state.step.mock.calls.length;
      now += 60_000;
      state.asleep = false;
      const inputTime = now;
      fireEvent.pointerMove(window);
      expect(callbacks.size).toBe(1);
      frame(inputTime + interval);
      expect(state.step.mock.calls.length).toBe(steps + 1);
      expect(state.step.mock.calls.at(-1)![1]).toBeCloseTo(interval);
    });
  }
  it('stops hidden frames and resumes from a fresh visible clock', () => {
    render(<LibrarySynapseField />);
    frame(10);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    fireEvent.pointerMove(window);
    expect(callbacks.size).toBe(0);
    now = 10_000;
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(callbacks.size).toBe(1);
    frame(now + 10);
    expect(state.step.mock.calls.at(-1)![1]).toBe(10);
  });
});
