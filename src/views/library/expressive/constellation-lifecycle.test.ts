import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene, Camera } from 'three';
import { fireEvent } from '@testing-library/react';

import { buildConstellation } from './constellation-model';
import { mountLibraryConstellation, type ConstellationHandle } from './constellation-scene';

type Snapshot = { matrices: number[]; camera: number[] };
const state = vi.hoisted(() => ({ draws: [] as Snapshot[], asleep: false, disposed: vi.fn() }));
vi.mock('@/widgets/ontology-map', () => ({
  ambientSleepFactor: () => state.asleep ? 0 : 1,
  isAmbientAsleep: (factor: number) => factor === 0,
}));
vi.mock('three', async (original) => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    setClearColor() {} setPixelRatio() {} setSize() {}
    render(scene: Scene, camera: Camera) {
      const matrices: number[] = [];
      scene.traverse((object) => {
        if (object instanceof actual.InstancedMesh) matrices.push(...object.instanceMatrix.array);
        if (object instanceof actual.LineSegments) matrices.push(...object.geometry.getAttribute('position').array);
      });
      state.draws.push({ matrices, camera: camera.position.toArray() });
    }
    dispose = state.disposed;
  } };
});

describe('Library constellation frame ownership', () => {
  let now: number;
  let callbacks: Map<number, FrameRequestCallback>;
  let intersect: IntersectionObserverCallback;
  let host: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let handles: ConstellationHandle[];
  let viewportDisconnect: ReturnType<typeof vi.fn>;
  let resize: ResizeObserverCallback;
  const model = buildConstellation({ sourceCount: 3, pageSourceCounts: [2] });
  const frame = (time: number) => {
    now = time;
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => callback(time));
  };
  const visible = (yes: boolean) => intersect([{ isIntersecting: yes } as IntersectionObserverEntry], {} as IntersectionObserver);
  const mount = (reducedMotion = false) => {
    const handle = mountLibraryConstellation(canvas, model, { reducedMotion });
    expect(handle).not.toBeNull();
    handles.push(handle!);
    return handle!;
  };
  const snapshot = () => state.draws.at(-1)!;
  beforeEach(() => {
    now = 0;
    callbacks = new Map();
    intersect = () => {};
    handles = [];
    state.draws = [];
    state.asleep = false;
    state.disposed.mockClear();
    let id = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callbacks.set(++id, callback); return id; });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((key) => { callbacks.delete(key); });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {} disconnect() {}
    });
    viewportDisconnect = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe() {} disconnect = viewportDisconnect;
    });
    host = document.createElement('div');
    canvas = document.createElement('canvas');
    host.append(canvas);
    document.body.append(host);
  });
  afterEach(() => { handles.forEach((handle) => handle.dispose()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('owns no frame before visibility and cancels it when off-screen', () => {
    mount();
    expect(callbacks.size).toBe(0);
    visible(true);
    frame(100);
    visible(false);
    expect(callbacks.size).toBe(0);
    const draws = state.draws.length;
    fireEvent.pointerMove(host, { clientX: 20, clientY: 20 });
    frame(10_000);
    expect(state.draws.length).toBe(draws);
  });
  for (const fps of [60, 120]) {
    it(`continues an interrupted assembly at its visible-time phase at ${fps} Hz`, () => {
      const interval = 1000 / fps;
      const handle = mount();
      visible(true);
      frame(200);
      visible(false);
      now = 60_200;
      visible(true);
      frame(now + interval);
      const resumed = snapshot();
      handle.dispose();
      now = 0;
      mount();
      visible(true);
      frame(200);
      frame(200 + interval);
      expect(resumed.matrices).toHaveLength(snapshot().matrices.length);
      resumed.matrices.forEach((value, index) => expect(value).toBeCloseTo(snapshot().matrices[index], 6));
      resumed.camera.forEach((value, index) => expect(value).toBeCloseTo(snapshot().camera[index], 10));
    });
  }
  it('parks asleep, wakes on its own input and releases observers on disposal', () => {
    const handle = mount();
    visible(true);
    frame(10_000);
    state.asleep = true;
    frame(10_010);
    expect(callbacks.size).toBe(0);
    now = 70_000;
    state.asleep = false;
    fireEvent.pointerLeave(host);
    expect(callbacks.size).toBe(1);
    frame(70_010);
    const pending = [...callbacks.values()];
    handle.dispose();
    expect(callbacks.size).toBe(0);
    expect(viewportDisconnect).toHaveBeenCalledOnce();
    const draws = state.draws.length;
    pending.forEach((callback) => callback(80_000));
    fireEvent.pointerLeave(host);
    expect(state.draws.length).toBe(draws);
    expect(callbacks.size).toBe(0);
  });
  it('repaints a resized canvas even after the object has parked asleep', () => {
    mount();
    visible(true);
    frame(10_000);
    state.asleep = true;
    frame(10_010);
    expect(callbacks.size).toBe(0);
    state.asleep = false;
    const draws = state.draws.length;
    resize([], {} as ResizeObserver);
    expect(callbacks.size).toBe(1);
    frame(10_020);
    expect(state.draws.length).toBe(draws + 1);
  });
  it('does not wake a hidden page when its canvas enters the viewport', () => {
    mount();
    visible(true);
    frame(100);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    expect(callbacks.size).toBe(0);
    visible(false);
    now = 60_000;
    visible(true);
    expect(callbacks.size).toBe(0);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    expect(callbacks.size).toBe(1);
  });
  it('starts a model changed while hidden from that model rather than old hidden time', () => {
    const handle = mount();
    visible(true);
    frame(100);
    visible(false);
    now = 30_000;
    handle.setModel(model);
    now = 60_000;
    visible(true);
    frame(60_200);
    const resumed = snapshot();
    handle.dispose();
    now = 0;
    mount();
    visible(true);
    frame(200);
    expect(resumed.matrices).toHaveLength(snapshot().matrices.length);
    resumed.matrices.forEach((value, index) => expect(value).toBeCloseTo(snapshot().matrices[index], 6));
  });
  it('draws the settled still for reduced motion or an unavailable viewport observer', () => {
    const reduced = mount(true);
    expect(state.draws).toHaveLength(1);
    expect(callbacks.size).toBe(0);
    const settled = snapshot().matrices;
    reduced.dispose();
    vi.stubGlobal('IntersectionObserver', undefined);
    mount();
    expect(snapshot().matrices).toEqual(settled);
    expect(callbacks.size).toBe(0);
  });
});
