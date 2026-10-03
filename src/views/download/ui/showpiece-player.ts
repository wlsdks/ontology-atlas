'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

import { EXIT_TRANSITION, MOTION, MOTION_EASE, STAGGER } from '@/shared/motion';
import { SPRING, springEasing, springSettleMs } from '@/shared/motion/spring';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';

export const SHOWPIECE_PART = 'data-showpiece-part';

export type FrameValue = Record<string, string | number>;
export type Stop = readonly [at: number, value: FrameValue, easing?: string];
export type ShowpieceTracks = Record<string, readonly (readonly Stop[])[]>;

const ms = (seconds: number) => Math.round(seconds * 1000);

export const SHOWPIECE_CLOCK = Object.freeze({
  fast: ms(MOTION.fast.duration),
  base: ms(MOTION.base.duration),
  settle: ms(MOTION.settle.duration),
  stagger: ms(STAGGER),
  surface: springSettleMs(SPRING.surface),
  control: springSettleMs(SPRING.control),
  canvas: springSettleMs(SPRING.canvas),
});

export const START_VISIBLE = 0.35;
export const HOLD_VISIBLE = 0.2;
export const PRESS_SCALE = 0.97;
export const LIGHT_LAYERS = ['halo', 'core', 'tip'] as const;
export type LightLayer = (typeof LIGHT_LAYERS)[number];

export interface ShowpieceLight {
  speed: number;
  hopMinMs: number;
  hopMaxMs: number;
  tail: number;
  intensity: number;
  restAlpha: number;
}

export interface ShowpieceEasing {
  ease: string;
  exit: string;
  place: string;
  canvas: string;
  surface: string;
  control: string;
}

export interface ShowpieceEnv {
  light: ShowpieceLight;
  easing: ShowpieceEasing;
}

/** Light values for tests and for a page whose tokens are missing; the page reads its own. */
export const FALLBACK_LIGHT: ShowpieceLight = {
  speed: 1100,
  hopMinMs: 180,
  hopMaxMs: 420,
  tail: 0.35,
  intensity: 0.9,
  restAlpha: 0.65,
};

const cubicBezier = (points: readonly number[]) => `cubic-bezier(${points.join(', ')})`;

export function readEnv(element: Element): ShowpieceEnv {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  };
  const linear =
    typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  const ease = cubicBezier(MOTION_EASE);
  const place = style.getPropertyValue('--motion-ease-place').trim();
  return {
    light: {
      speed: read('--map-light-speed', FALLBACK_LIGHT.speed),
      hopMinMs: read('--map-light-hop-min-ms', FALLBACK_LIGHT.hopMinMs),
      hopMaxMs: read('--map-light-hop-max-ms', FALLBACK_LIGHT.hopMaxMs),
      tail: read('--map-light-tail', FALLBACK_LIGHT.tail),
      intensity: read('--map-light-intensity', FALLBACK_LIGHT.intensity),
      restAlpha: read('--map-spotlight-rest-alpha', FALLBACK_LIGHT.restAlpha),
    },
    easing: {
      ease,
      exit: cubicBezier(EXIT_TRANSITION.ease),
      place: place.startsWith('cubic-bezier') ? place : ease,
      canvas: linear ? springEasing(SPRING.canvas) : ease,
      surface: linear ? springEasing(SPRING.surface) : ease,
      control: linear ? springEasing(SPRING.control) : ease,
    },
  };
}

export const TEST_ENV: ShowpieceEnv = {
  light: FALLBACK_LIGHT,
  easing: {
    ease: cubicBezier(MOTION_EASE),
    exit: cubicBezier(EXIT_TRANSITION.ease),
    place: cubicBezier(MOTION_EASE),
    canvas: cubicBezier(MOTION_EASE),
    surface: cubicBezier(MOTION_EASE),
    control: cubicBezier(MOTION_EASE),
  },
};

/** Keyframes on one clock: every frame carries every property, the last value held until the next stop. */
export function frames(duration: number, stops: readonly Stop[]): Keyframe[] {
  const keys = [...new Set(stops.flatMap(([, value]) => Object.keys(value)))];
  const held: FrameValue = {};
  for (const key of keys) held[key] = stops.find(([, value]) => key in value)![1][key]!;
  const out: Keyframe[] = [];
  const place = (at: number, value: FrameValue, easing?: string) => {
    Object.assign(held, value);
    out.push({ ...held, offset: Math.min(1, Math.max(0, at / duration)), ...(easing ? { easing } : {}) });
  };
  if (stops[0]![0] > 0) place(0, {});
  for (const [at, value, easing] of stops) place(at, value, easing);
  if (stops[stops.length - 1]![0] < duration) place(duration, {});
  return out;
}

export function hopMs(length: number, light: ShowpieceLight): number {
  return Math.round(Math.min(light.hopMaxMs, Math.max(light.hopMinMs, (length / light.speed) * 1000)));
}

const round = (value: number) => Math.round(value * 100) / 100;

export function lightDash(layer: LightLayer, tail: number): number {
  if (layer === 'halo') return round(tail * 0.6);
  if (layer === 'core') return tail;
  return round(tail * 0.4);
}

/** The conduction figure's light: a dash on a unit path that leaves its cause and is gone on arrival. */
export function lightStops(start: number, hop: number, layer: LightLayer, light: ShowpieceLight): Stop[] {
  const dash = lightDash(layer, light.tail);
  const alpha = round(light.intensity * (layer === 'halo' ? 0.32 : 0.55));
  const end = start + Math.round(hop * (1 + dash));
  return [
    [0, { strokeDasharray: `${dash} 3`, strokeDashoffset: String(dash), opacity: 0 }],
    [start, { strokeDashoffset: String(dash), opacity: 0 }],
    [start, { opacity: alpha }, 'linear'],
    [end, { strokeDashoffset: '-1', opacity: alpha }],
    [end, { opacity: 0 }],
  ];
}

export const LIGHT_REST: FrameValue = { opacity: 0, strokeDashoffset: '-1' };

/** Offsets of an HTML element inside `stage`, ignoring transforms, so a figure in motion measures its rest layout. */
export function layoutBox(element: HTMLElement, stage: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  while (node && node !== stage) {
    x += node.offsetLeft;
    y += node.offsetTop;
    const parent = node.offsetParent as HTMLElement | null;
    if (parent && parent !== stage && !stage.contains(parent)) return null;
    node = parent;
  }
  if (node !== stage) return null;
  return { x, y, width: element.offsetWidth, height: element.offsetHeight };
}

export type LayoutBox = NonNullable<ReturnType<typeof layoutBox>>;

function kebab(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function applyFrame(element: HTMLElement | SVGElement, frame: Keyframe) {
  for (const [key, value] of Object.entries(frame)) {
    if (key === 'offset' || key === 'easing' || key === 'composite' || value == null) continue;
    element.style.setProperty(kebab(key), String(value));
  }
}

function partsOf(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement | SVGElement>(`[${SHOWPIECE_PART}]`)];
}

let owner: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const readOwner = () => owner;
const serverOwner = () => null;

const unchanging = () => () => undefined;
const animatesOnClient = () => typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
const observesOnClient = () => typeof IntersectionObserver !== 'undefined';
const onServer = () => false;

export type ShowpieceState = 'still' | 'primed' | 'running' | 'paused' | 'finished';

interface ShowpieceOptions {
  duration: number;
  /** Measures the rest layout and returns every part's lanes; parts it omits do not move. */
  build: (root: HTMLElement, env: ShowpieceEnv) => ShowpieceTracks;
  /** A change (a new layout) ends a run on its rest frame instead of playing stale geometry. */
  layoutKey: string;
}

/**
 * One showpiece's clock: primed (opening frame as inline style, no animation) once it comes within a
 * viewport, played once from 35% visible, held below 20%, in a hidden tab or while another showpiece plays
 * (the later start wins), and at rest with no animation left. Reduced motion, no `Element.animate`, or a
 * refusal keeps the rest frame React rendered.
 */
export function useShowpiece({ duration, build, layoutKey }: ShowpieceOptions) {
  const id = useId();
  const reduced = usePrefersReducedMotion();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [figure, setFigure] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(false);
  const [seen, setSeen] = useState(false);
  const [started, setStarted] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [refused, setRefused] = useState(false);
  const animations = useRef<Animation[]>([]);
  const finalFrames = useRef<[HTMLElement | SVGElement, Keyframe][]>([]);
  const buildRef = useRef(build);
  useLayoutEffect(() => {
    buildRef.current = build;
  });

  const animates = useSyncExternalStore(unchanging, animatesOnClient, onServer);
  const observes = useSyncExternalStore(unchanging, observesOnClient, onServer);
  const current = useSyncExternalStore(subscribe, readOwner, serverOwner);
  const canAnimate = animates && observes && !reduced && !refused;
  const eligible = canAnimate && started && !finished && !userPaused && seen && pageVisible;
  const running = eligible && current === id;

  useEffect(() => {
    if (!figure) return;
    const syncPage = () => setPageVisible(document.visibilityState !== 'hidden');
    syncPage();
    document.addEventListener('visibilitychange', syncPage);
    if (!observes) return () => document.removeEventListener('visibilitychange', syncPage);
    let first = true;
    const approach = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: '100% 0px' },
    );
    const view = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry) return;
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        if (first) {
          first = false;
          // A reload with the figure already in view shows the rest frame instead of playing over reading.
          if (ratio >= HOLD_VISIBLE) setFinished(true);
        }
        setSeen(ratio >= HOLD_VISIBLE);
        if (ratio >= START_VISIBLE) setStarted(true);
      },
      { threshold: [0, HOLD_VISIBLE, START_VISIBLE] },
    );
    approach.observe(figure);
    view.observe(figure);
    return () => {
      document.removeEventListener('visibilitychange', syncPage);
      approach.disconnect();
      view.disconnect();
    };
  }, [figure, observes]);

  const vacant = current === null;
  useEffect(() => {
    if (eligible && owner !== id) {
      owner = id;
      emit();
    }
    if (!eligible && owner === id) {
      owner = null;
      emit();
    }
  }, [eligible, id, vacant]);

  useEffect(
    () => () => {
      if (owner === id) {
        owner = null;
        emit();
      }
    },
    [id],
  );

  const settle = useCallback(() => {
    for (const animation of animations.current) animation.cancel();
    for (const [element, frame] of finalFrames.current) applyFrame(element, frame);
    animations.current = [];
    finalFrames.current = [];
  }, []);

  const tracksFor = useCallback(
    (scene: HTMLElement) => {
      const tracks = buildRef.current(scene, readEnv(scene));
      return partsOf(scene).flatMap((element) => {
        const lanes = tracks[element.getAttribute(SHOWPIECE_PART) ?? ''] ?? [];
        return lanes.map((stops) => ({ element, keyframes: frames(duration, stops) }));
      });
    },
    [duration],
  );

  // Prime: the opening frame as plain inline style, which holds no animation and no layer.
  useLayoutEffect(() => {
    if (!root || !canAnimate || finished || !near || animations.current.length > 0) return;
    const lanes = tracksFor(root);
    for (const { element, keyframes } of lanes) applyFrame(element, keyframes[0]!);
    finalFrames.current = lanes.map(({ element, keyframes }) => [element, keyframes[keyframes.length - 1]!]);
  }, [root, canAnimate, finished, near, generation, tracksFor, layoutKey]);

  useLayoutEffect(() => {
    if (!root) return;
    if (!running) {
      for (const animation of animations.current) animation.pause();
      return;
    }
    if (animations.current.length > 0) {
      for (const animation of animations.current) animation.play();
      return;
    }
    const created: Animation[] = [];
    try {
      const lanes = tracksFor(root);
      finalFrames.current = lanes.map(({ element, keyframes }) => [element, keyframes[keyframes.length - 1]!]);
      for (const { element, keyframes } of lanes) created.push(element.animate(keyframes, { duration, fill: 'both' }));
    } catch {
      for (const animation of created) animation.cancel();
      settle();
      void Promise.resolve().then(() => setRefused(true));
      return;
    }
    animations.current = created;
    void Promise.all(created.map((animation) => animation.finished)).then(
      () => {
        if (animations.current !== created) return;
        settle();
        setFinished(true);
      },
      () => undefined,
    );
  }, [root, running, generation, duration, tracksFor, settle]);

  // Reduced motion switched on mid-run, a new layout, or unmounting: jump to the rest frame.
  useLayoutEffect(() => {
    if (canAnimate) return;
    settle();
  }, [canAnimate, settle]);

  const layoutSeen = useRef(layoutKey);
  useLayoutEffect(() => {
    if (layoutSeen.current === layoutKey) return;
    layoutSeen.current = layoutKey;
    if (animations.current.length === 0) return;
    settle();
    setFinished(true);
  }, [layoutKey, settle]);

  useEffect(() => settle, [settle]);

  const state: ShowpieceState = !canAnimate
    ? 'still'
    : finished
      ? 'finished'
      : running
        ? 'running'
        : started
          ? 'paused'
          : 'primed';

  const press = useCallback(() => {
    if (finished) {
      setUserPaused(false);
      setFinished(false);
      setStarted(true);
      setGeneration((value) => value + 1);
      return;
    }
    setUserPaused((value) => !value);
  }, [finished]);

  return { setRoot, setFigure, state, canAnimate, finished, userPaused, press };
}
