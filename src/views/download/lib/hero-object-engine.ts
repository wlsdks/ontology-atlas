/**
 * The real vault graph (`docs/ontology`, the same one the caption counts) as a canvas-2D depth
 * projection: one plane per kind, weak perspective s = f / (f + z), depth fog, painter's order.
 * Colours come from CSS tokens. Reduced motion draws one still frame and only a drag redraws
 * (WCAG 2.3.3's user-initiated exception). Per frame O(N log N + E log E): sorts by depth.
 */

import { registerGatewayFrameClient } from './gateway-frame-loop';
import { echoCount, echoOrder, preferredParents } from './hero-echo';

const TAU = Math.PI * 2;

interface HeroGraphNode {
  /** Slug: only a stable sort key and jitter seed. */
  s: string;
  k: 'project' | 'domain' | 'capability' | 'element';
  /** World coordinates, filled in by layout. */
  px?: number;
  py?: number;
  pz?: number;
}

interface HeroGraphEdge {
  a: string;
  b: string;
  y: 'contains' | 'depends';
}

export interface HeroGraphData {
  nodes: HeroGraphNode[];
  edges: HeroGraphEdge[];
}

export interface HeroEngineOptions {
  /** Defaults to document.documentElement. */
  tokenEl?: Element;
  /** Default 48000: a rotation to gaze at, not a carousel. */
  periodMs?: number;
  inkScale?: number;
  /** Measured on the shorter side. */
  fitPx?: number;
  /** Defaults to matchMedia. */
  forceReduced?: boolean;
  /** Dots light only as `setTyping` earns them; without it the engine assembles per tier on its own clock. */
  echo?: boolean;
  /** Never fires while dragging. */
  onHover?: (slug: string | null) => void;
  /** Fractions of the stage for the ink envelope's centre (default 0.5/0.5). */
  anchor?: { x: number; y?: number; bottomPx?: number };
  /** A background dome must yield to the type over it. */
  dim?: number;
  /** Lean toward a fine pointer; never under reduced motion. */
  tilt?: boolean;
  /** Scroll progress 0..1 as the hero leaves; read per frame, ignored under reduced motion. */
  camera?: () => number;
  /** `plane` lays every tier on one floor, the evidence map's own form, so the scroll camera can hand over to it. */
  form?: 'dome' | 'plane';
  /** Radians; default 0.34 for the dome, 0.95 for the plane. */
  pitch?: number;
}

export interface HeroEngineHandle {
  dispose: () => void;
  /** Only read when `echo` is on. */
  setTyping: (typed: number, total: number) => void;
  /** For gates. */
  litCount: () => number;
  /** Last drawn frame, canvas CSS px; for gates. */
  nodesOnScreen: () => { s: string; k: HeroGraphNode['k']; x: number; y: number }[];
}

function smooth01(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

/** Deterministic hash to [0,1) for stable per-node jitter. */
function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function cssVar(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function hexRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const n = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

interface PlaneSpec {
  y: number;
  r: number;
}

const PLANE: Record<HeroGraphNode['k'], PlaneSpec> = {
  /** Low enough that the thin spine to the apex leaves no dead space at the top. */
  project: { y: 104, r: 0 },
  domain: { y: 56, r: 148 },
  capability: { y: -48, r: 192 },
  element: { y: -150, r: 224 },
};

interface HeroModel {
  nodes: HeroGraphNode[];
  edges: HeroGraphEdge[];
  bySlug: Map<string, HeroGraphNode>;
}

/** One plane per kind; children fan out beneath their parent's angular slice. */
function layoutHeroGraph(data: HeroGraphData): HeroModel {
  const nodes = data.nodes;
  const edges = data.edges;
  const byKind: Record<HeroGraphNode['k'], HeroGraphNode[]> = {
    project: [],
    domain: [],
    capability: [],
    element: [],
  };
  const bySlug = new Map<string, HeroGraphNode>();
  for (const n of nodes) {
    byKind[n.k].push(n);
    bySlug.set(n.s, n);
  }

  const parentOf = preferredParents(nodes, edges);

  const doms = byKind.domain.slice().sort((a, b) => (a.s < b.s ? -1 : 1));
  const angle = new Map<string, number>();
  doms.forEach((d, i) => {
    angle.set(d.s, (i / Math.max(1, doms.length)) * TAU - Math.PI / 2);
  });

  function fan(kids: HeroGraphNode[], ringR: number, sectorW: number): void {
    const groups = new Map<number, HeroGraphNode[]>();
    for (const k of kids) {
      const p = parentOf.get(k.s);
      const viaParent = p !== undefined ? angle.get(p) : undefined;
      const grandparent = p !== undefined ? parentOf.get(p) : undefined;
      const viaGrandparent =
        grandparent !== undefined ? angle.get(grandparent) : undefined;
      const a = viaParent ?? viaGrandparent ?? hash01(k.s) * TAU;
      const group = groups.get(a);
      if (group) group.push(k);
      else groups.set(a, [k]);
    }
    for (const [a0, group] of groups) {
      const g = group.sort((x, y) => (x.s < y.s ? -1 : 1));
      g.forEach((k, i) => {
        const t = g.length === 1 ? 0 : i / (g.length - 1) - 0.5;
        const a = a0 + t * sectorW;
        // A crowded fan splits into two lanes; +11/−5 with ±4 jitter keeps them inside their ring's band.
        const r =
          ringR + (g.length > 4 ? (i % 2 ? 11 : -5) : 0) + (hash01(k.s) - 0.5) * 8;
        angle.set(k.s, a);
        k.px = Math.cos(a) * r;
        k.pz = Math.sin(a) * r;
      });
    }
  }

  for (const p of byKind.project) {
    p.px = 0;
    p.pz = 0;
    p.py = PLANE.project.y;
  }
  for (const d of doms) {
    const a = angle.get(d.s) ?? 0;
    d.px = Math.cos(a) * PLANE.domain.r;
    d.pz = Math.sin(a) * PLANE.domain.r;
    d.py = PLANE.domain.y;
  }
  const sector = TAU / Math.max(1, doms.length);
  fan(byKind.capability, PLANE.capability.r, sector * 0.62);
  for (const c of byKind.capability) c.py = PLANE.capability.y;
  fan(byKind.element, PLANE.element.r, sector * 0.78);
  for (const el of byKind.element) el.py = PLANE.element.y;

  return { nodes, edges, bySlug };
}

const NODE_R: Record<HeroGraphNode['k'], number> = {
  project: 10.5,
  domain: 4.6,
  capability: 3.1,
  element: 2.05,
};

const TIER_DELAY: Record<HeroGraphNode['k'], number> = {
  project: 0,
  domain: 180,
  capability: 380,
  element: 600,
};

const KINDS: readonly HeroGraphNode['k'][] = [
  'project',
  'domain',
  'capability',
  'element',
];

/** While dragging, deeper planes follow slightly late and then recover. */
const LAG_WEIGHT: Record<HeroGraphNode['k'], number> = {
  project: 0,
  domain: -0.1,
  capability: -0.2,
  element: -0.3,
};

export function mountHeroObject(
  canvas: HTMLCanvasElement,
  data: HeroGraphData,
  opts: HeroEngineOptions = {},
): HeroEngineHandle | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null; // jsdom or context exhaustion.

  const reduced =
    opts.forceReduced ??
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  const model = layoutHeroGraph(data);
  const flat = opts.form === 'plane';
  if (flat) for (const n of model.nodes) n.py = 0;
  const planeY = (kind: HeroGraphNode['k']): number => (flat ? 0 : PLANE[kind].y);

  const rootEl = opts.tokenEl ?? document.documentElement;
  // The token's value follows the accent switch despite its name.
  const accent = hexRgb(cssVar(rootEl, '--color-indigo-brand', '#5e6ad2'));
  const accent2 = hexRgb(cssVar(rootEl, '--color-indigo-accent', '#7170ff'));
  const ink = hexRgb(cssVar(rootEl, '--color-text-primary', '#f7f8f8'));
  const fill = hexRgb(cssVar(rootEl, '--color-panel', '#0f1011'));

  const PERIOD = opts.periodMs ?? 48000;
  const PITCH = opts.pitch ?? (flat ? 0.95 : 0.34);
  const F = 1050;
  const ASSEMBLE = 1600;
  const inkScale = opts.inkScale ?? 1;

  const cosP0 = Math.cos(PITCH);
  const sinP0 = Math.sin(PITCH);

  /**
   * Projected extent before `scaleFit`, sampled over a full yaw turn so it holds at any angle.
   * The ink is not symmetric about the origin, so the envelope's centre is what gets anchored,
   * and it clamps the scale, or the dome's bottom is clipped.
   */
  const envelope = (() => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const consider = (px: number, py: number, pz: number, cy: number, sy: number, pad: number): void => {
      const x = px * cy - pz * sy;
      const z = px * sy + pz * cy;
      const y2 = py * cosP0 + z * sinP0;
      const z2 = -py * sinP0 + z * cosP0;
      const s = F / (F + z2);
      const ux = x * s;
      const uy = -y2 * s;
      const r = pad * s;
      if (ux - r < x0) x0 = ux - r;
      if (ux + r > x1) x1 = ux + r;
      if (uy - r < y0) y0 = uy - r;
      if (uy + r > y1) y1 = uy + r;
    };
    const YAW_SAMPLES = 24;
    for (let k = 0; k < YAW_SAMPLES; k += 1) {
      const yawS = (k / YAW_SAMPLES) * TAU;
      const cy = Math.cos(yawS);
      const sy = Math.sin(yawS);
      for (const n of model.nodes) {
        consider(n.px ?? 0, n.py ?? 0, n.pz ?? 0, cy, sy, NODE_R[n.k] * 2.1);
      }
      // The rim is drawn even where no node sits.
      for (const kind of ['element', 'capability', 'domain'] as const) {
        const P = PLANE[kind];
        for (let i = 0; i < 24; i += 1) {
          const a = (i / 24) * TAU;
          consider(Math.cos(a) * P.r, planeY(kind), Math.sin(a) * P.r, cy, sy, 0);
        }
      }
    }
    return { x0, y0, x1, y1 };
  })();

  let W = 0;
  let H = 0;
  let dpr = 1;
  let scaleFit = 1;
  let centerX = 0;
  let centerY = 0;
  function size(): void {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Tilt leans up to ~0.1 rad past the sampled sweep, so it gets twice the margin.
    const MARGIN = opts.tilt ? 0.08 : 0.04;
    const envW = Math.max(1, envelope.x1 - envelope.x0);
    const envH = Math.max(1, envelope.y1 - envelope.y0);
    scaleFit = Math.min(
      Math.min(W, H) / (opts.fitPx ?? 620),
      (W * (1 - MARGIN * 2)) / envW,
      (H * (1 - MARGIN * 2)) / envH,
    );
    const ax = opts.anchor?.x ?? 0.5;
    const ay = opts.anchor?.y ?? 0.5;
    const envMidY = ((envelope.y0 + envelope.y1) / 2) * scaleFit;
    centerX = W * ax - ((envelope.x0 + envelope.x1) / 2) * scaleFit;
    // Pixels, not a fraction: the narrow plinth's height follows the copy.
    centerY =
      opts.anchor?.bottomPx !== undefined ? H - opts.anchor.bottomPx - envMidY : H * ay - envMidY;
  }
  size();

  /** Each dot fades in from its own moment, so two keystrokes' dots never share a frame. */
  const echo = opts.echo === true;
  const order = echoOrder(model.nodes);
  const revealAt = new Map<string, number>();
  const REVEAL_MS = parseFloat(cssVar(rootEl, '--motion-base', '180ms')) || 180;

  const parentOf = preferredParents(model.nodes, model.edges);

  let hover: string | null = null;
  const HIT_PX = 14;
  let lastProjected = new Map<string, Projected>();
  let lastAlpha = new Map<string, number>();

  let userYaw = 0;
  let userVel = 0;
  let dragging = false;
  let lastX = 0;
  const lag: Record<HeroGraphNode['k'], number> = {
    project: 0,
    domain: 0,
    capability: 0,
    element: 0,
  };

  const onPointerDown = (e: PointerEvent): void => {
    dragging = true;
    // A press clears the hover, or ring and caption ride the turning object on a dot the pointer left.
    setHover(null);
    lastX = e.clientX;
    userVel = 0;
    canvas.setPointerCapture(e.pointerId);
    setCursor('grabbing');
  };
  const setHover = (next: string | null): void => {
    if (next === hover) return;
    hover = next;
    opts.onHover?.(hover);
    if (reduced) drawAt(lastT);
  };
  /** Canvas px, re-tested every frame while the projection moves. */
  let pointerAt: { x: number; y: number } | null = null;
  const hitAt = (x: number, y: number): string | null => {
    let best: string | null = null;
    let bestD = HIT_PX * HIT_PX;
    for (const [s, p] of lastProjected) {
      if ((lastAlpha.get(s) ?? 0) < 0.5) continue;
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) {
      const rect = canvas.getBoundingClientRect();
      pointerAt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const best = hitAt(pointerAt.x, pointerAt.y);
      setHover(best);
      setCursor(best !== null ? 'grab' : 'default');
      return;
    }
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const d = dx * 0.006;
    userYaw += d;
    userVel = d;
    for (const k of KINDS) lag[k] += d * LAG_WEIGHT[k];
    if (reduced) drawAt(lastT);
  };
  const onPointerUp = (): void => {
    dragging = false;
    setCursor(hover !== null ? 'grab' : 'default');
  };
  const onPointerLeave = (): void => {
    pointerAt = null;
    setHover(null);
    setCursor('default');
  };
  canvas.style.touchAction = 'pan-y';
  /** `grab` only over a lit dot, not bare ground; mirrored on `data-hero-cursor` for the gate. */
  const setCursor = (value: 'default' | 'grab' | 'grabbing'): void => {
    canvas.style.cursor = value;
    canvas.dataset.heroCursor = value;
  };
  setCursor('default');
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  const onResize = (): void => {
    size();
    drawAt(lastT);
  };
  addEventListener('resize', onResize);
  /** The box can change after `resize` fires, leaving the canvas blank; the window listener is the fallback. */
  const boxObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(() => onResize()) : null;
  boxObserver?.observe(canvas);
  /* A lost 2D context would leave a permanent blank, so restore resizes and redraws. */
  const onContextLost = (e: Event): void => e.preventDefault();
  const onContextRestored = (): void => onResize();
  canvas.addEventListener('contextlost', onContextLost);
  canvas.addEventListener('contextrestored', onContextRestored);

  /** Radians, eased toward per frame; zero when the pointer leaves. */
  let tiltYawT = 0;
  let tiltPitchT = 0;
  let tiltYaw = 0;
  let tiltPitch = 0;
  const finePointer =
    typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;
  const onLean = (e: PointerEvent): void => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height) * 2 - 1));
    tiltYawT = nx * 0.16;
    tiltPitchT = -ny * 0.09;
  };
  const onLeanEnd = (): void => {
    tiltYawT = 0;
    tiltPitchT = 0;
  };
  const tilt = opts.tilt === true && finePointer && !reduced;
  if (tilt) {
    addEventListener('pointermove', onLean, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeanEnd);
    addEventListener('blur', onLeanEnd);
  }
  let cam = 0;
  let camScale = 1;
  let camLift = 0;
  let camShiftX = 0;
  const PITCH_TOP = 1.35;
  /** 16.7 when drawn outside the loop. */
  let frameDt = 16.7;
  const TILT_TAU_MS = 280;
  const CAM_TAU_MS = 90;
  const INERTIA_TAU_MS = 540;

  let cosP = cosP0;
  let sinP = sinP0;
  interface Projected {
    x: number;
    y: number;
    s: number;
    z: number;
  }
  function project(px: number, py: number, pz: number, cy: number, sy: number): Projected {
    const x = px * cy - pz * sy;
    const z = px * sy + pz * cy;
    const y2 = py * cosP + z * sinP;
    const z2 = -py * sinP + z * cosP;
    const s = F / (F + z2);
    const k = scaleFit * camScale;
    return { x: x * s * k + centerX + camShiftX, y: -y2 * s * k + centerY - camLift, s, z: z2 };
  }

  function tierAlpha(kind: HeroGraphNode['k'], t: number): number {
    if (reduced || t >= ASSEMBLE + 600) return 1;
    const dt = (t - TIER_DELAY[kind]) / 520;
    if (dt <= 0) return 0;
    if (dt >= 1) return 1;
    return 1 - (1 - dt) ** 3;
  }

  /** Its own echo moment when driven, its tier's when standalone. */
  function nodeAlpha(n: HeroGraphNode, t: number): number {
    if (reduced) return 1;
    if (!echo) return tierAlpha(n.k, t);
    const at = revealAt.get(n.s);
    if (at === undefined) return 0;
    const dt = (t - at) / REVEAL_MS;
    if (dt >= 1) return 1;
    return 1 - (1 - Math.max(0, dt)) ** 3;
  }

  const dependsEdges = model.edges.filter((e) => e.y === 'depends');
  const containsEdges = model.edges.filter((e) => e.y === 'contains');

  let lastT = 0;
  let disposed = false;
  let unregisterFrame: (() => void) | null = null;

  function drawAt(t: number): void {
    if (disposed) return;
    lastT = t;
    ctx!.clearRect(0, 0, W, H);
    if (!reduced) {
      // Time-based, or a per-frame lerp settles twice as fast at 120Hz.
      const kTilt = 1 - Math.exp(-frameDt / TILT_TAU_MS);
      const kCam = 1 - Math.exp(-frameDt / CAM_TAU_MS);
      tiltYaw += (tiltYawT - tiltYaw) * kTilt;
      tiltPitch += (tiltPitchT - tiltPitch) * kTilt;
      const target = opts.camera ? Math.max(0, Math.min(1, opts.camera())) : 0;
      cam += (target - cam) * kCam;
    }
    // As the hero leaves, the plane lays down toward the evidence map's top-down view, drifts to
    // the centre and fades over the last third, so the next stage arrives where the plane was.
    const pitch = PITCH + tiltPitch + cam * (PITCH_TOP - PITCH);
    cosP = Math.cos(pitch);
    sinP = Math.sin(pitch);
    camScale = 1 + cam * 0.4;
    // It scrolls away with its section; following the viewport would carry it behind the facts links.
    const drift = smooth01((cam - 0.3) / 0.6);
    camLift = cam * H * 0.1;
    camShiftX = drift * (W * 0.5 - W * (opts.anchor?.x ?? 0.5));
    const camFade = 1 - smooth01((cam - 0.55) / 0.4);
    ctx!.globalAlpha = inkScale * (opts.dim ?? 1) * camFade;
    if (ctx!.globalAlpha <= 0.005) return;
    const yaw = (reduced ? 0.55 : (t / PERIOD) * TAU) + userYaw + 0.55 + tiltYaw + cam * 0.9;
    const trig: Record<HeroGraphNode['k'], [number, number]> = {
      project: [0, 0],
      domain: [0, 0],
      capability: [0, 0],
      element: [0, 0],
    };
    for (const k of KINDS) {
      lag[k] *= 0.9;
      const yk = yaw + lag[k];
      trig[k] = [Math.cos(yk), Math.sin(yk)];
    }
    const [cy, sy] = trig.capability;

    const projected = new Map<string, Projected>();
    const alphaOf = new Map<string, number>();
    const tierMax: Record<HeroGraphNode['k'], number> = { project: 0, domain: 0, capability: 0, element: 0 };
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const n of model.nodes) {
      const p = project(n.px ?? 0, n.py ?? 0, n.pz ?? 0, trig[n.k][0], trig[n.k][1]);
      projected.set(n.s, p);
      const a = nodeAlpha(n, t);
      alphaOf.set(n.s, a);
      if (a > tierMax[n.k]) tierMax[n.k] = a;
      if (p.z < zMin) zMin = p.z;
      if (p.z > zMax) zMax = p.z;
    }
    lastProjected = projected;
    lastAlpha = alphaOf;
    /* Re-hit every frame, or a still pointer's ring stays while the dot turns away. */
    if (!dragging && pointerAt !== null && !reduced) {
      const best = hitAt(pointerAt.x, pointerAt.y);
      if (best !== hover) {
        setHover(best);
        setCursor(best !== null ? 'grab' : 'default');
      }
    }
    const zSpan = Math.max(1, zMax - zMin);
    const fog = (z: number): number => {
      const u = (z - zMin) / zSpan;
      // Floor 0.22: lower, the far half of each turn fell below perceptibility.
      return 0.22 + 0.78 * (1 - u) ** 1.8;
    };
    const lw = (z: number): number => {
      const u = (z - zMin) / zSpan;
      return 0.45 + 1.15 * (1 - u);
    };

    for (const kind of ['element', 'capability', 'domain'] as const) {
      const P = PLANE[kind];
      const a = tierMax[kind];
      if (a <= 0.01) continue;
      const pts: Projected[] = [];
      for (let i = 0; i <= 48; i += 1) {
        const ang = (i / 48) * TAU;
        pts.push(
          project(Math.cos(ang) * P.r, planeY(kind), Math.sin(ang) * P.r, trig[kind][0], trig[kind][1]),
        );
      }
      ctx!.beginPath();
      pts.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
      ctx!.closePath();
      // A constant fill: a gradient would assert a light source that encodes nothing.
      ctx!.fillStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${0.018 * a})`;
      ctx!.fill();
      for (let i = 0; i < 48; i += 1) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const f = fog((p0.z + p1.z) / 2);
        ctx!.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${0.3 * f * a})`;
        ctx!.lineWidth = lw((p0.z + p1.z) / 2) * 0.8;
        ctx!.beginPath();
        ctx!.moveTo(p0.x, p0.y);
        ctx!.lineTo(p1.x, p1.y);
        ctx!.stroke();
      }
    }

    const eSorted = containsEdges
      .map((e) => {
        const A = projected.get(e.a)!;
        const B = projected.get(e.b)!;
        return { e, A, B, z: (A.z + B.z) / 2 };
      })
      .sort((a, b) => b.z - a.z);
    for (const it of eSorted) {
      const ka = model.bySlug.get(it.e.a)!.k;
      const kb = model.bySlug.get(it.e.b)!.k;
      const a = Math.min(alphaOf.get(it.e.a) ?? 0, alphaOf.get(it.e.b) ?? 0);
      if (a <= 0.01) continue;
      const f = fog(it.z);
      // Spokes stand out by width alone, so indigo here means only `depends`.
      const spine = ka === 'project' || kb === 'project';
      ctx!.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${(spine ? 0.34 : 0.24) * f * a})`;
      ctx!.lineWidth = lw(it.z) * (spine ? 1.1 : 0.85);
      ctx!.beginPath();
      ctx!.moveTo(it.A.x, it.A.y);
      ctx!.lineTo(it.B.x, it.B.y);
      ctx!.stroke();
    }

    // Dash motion, not glow: the map section's `.flow` pulse grammar.
    for (const e of dependsEdges) {
      const na = model.bySlug.get(e.a);
      const nb = model.bySlug.get(e.b);
      if (!na || !nb) continue;
      const a = Math.min(alphaOf.get(e.a) ?? 0, alphaOf.get(e.b) ?? 0);
      if (a <= 0.01) continue;
      const mx = ((na.px ?? 0) + (nb.px ?? 0)) / 2;
      const mz = ((na.pz ?? 0) + (nb.pz ?? 0)) / 2;
      const my = (na.py ?? 0) + 46;
      ctx!.beginPath();
      let zSum = 0;
      const STEPS = 22;
      for (let i = 0; i <= STEPS; i += 1) {
        const u = i / STEPS;
        const v = 1 - u;
        const px = v * v * (na.px ?? 0) + 2 * v * u * mx + u * u * (nb.px ?? 0);
        const py = v * v * (na.py ?? 0) + 2 * v * u * my + u * u * (nb.py ?? 0);
        const pz = v * v * (na.pz ?? 0) + 2 * v * u * mz + u * u * (nb.pz ?? 0);
        const p = project(px, py, pz, cy, sy);
        zSum += p.z;
        if (i) ctx!.lineTo(p.x, p.y);
        else ctx!.moveTo(p.x, p.y);
      }
      const f = fog(zSum / (STEPS + 1));
      ctx!.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${Math.min(0.9, 0.75 * f) * a})`;
      ctx!.lineWidth = 1.1;
      ctx!.stroke();
      if (!reduced) {
        ctx!.save();
        ctx!.setLineDash([3, 150]);
        ctx!.lineDashOffset = -((t / 14) % 153);
        ctx!.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${Math.min(1, 1.1 * f) * a})`;
        ctx!.lineWidth = 1.6;
        ctx!.stroke();
        ctx!.restore();
      }
    }

    const nSorted = model.nodes
      .slice()
      .sort((a, b) => projected.get(b.s)!.z - projected.get(a.s)!.z);
    for (const n of nSorted) {
      const p = projected.get(n.s)!;
      const a = alphaOf.get(n.s) ?? 0;
      if (a <= 0.01) continue;
      const f = fog(p.z);
      const r = NODE_R[n.k] * p.s * scaleFit * 2.1;
      if (n.k === 'project') {
        ctx!.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const ang = (i / 6) * TAU - Math.PI / 2;
          const hx = p.x + Math.cos(ang) * r;
          const hy = p.y + Math.sin(ang) * r * 0.92;
          if (i) ctx!.lineTo(hx, hy);
          else ctx!.moveTo(hx, hy);
        }
        ctx!.closePath();
        ctx!.fillStyle = `rgba(${fill[0]},${fill[1]},${fill[2]},${0.94 * a})`;
        ctx!.fill();
        ctx!.strokeStyle = `rgba(${accent[0]},${accent[1]},${accent[2]},${Math.min(1, 0.4 + 0.6 * f) * a})`;
        ctx!.lineWidth = 1.5;
        ctx!.stroke();
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1.6, 0, TAU);
        ctx!.fillStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${0.9 * a})`;
        ctx!.fill();
      } else {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, Math.max(0.8, r), 0, TAU);
        ctx!.fillStyle = `rgba(${fill[0]},${fill[1]},${fill[2]},${0.92 * a})`;
        ctx!.fill();
        const sA = n.k === 'domain' ? 0.95 : n.k === 'capability' ? 0.8 : 0.65;
        ctx!.strokeStyle = `rgba(${ink[0]},${ink[1]},${ink[2]},${Math.min(0.95, sA * f) * a})`;
        ctx!.lineWidth = lw(p.z) * 0.9;
        ctx!.stroke();
      }
    }

    // A stroke ring, not a shadow, as the map's selection draws.
    if (hover !== null) {
      const p = projected.get(hover);
      const n = model.bySlug.get(hover);
      if (p && n) {
        const parent = parentOf.get(hover);
        const pp = parent !== undefined ? projected.get(parent) : undefined;
        if (pp) {
          ctx!.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0.95)`;
          ctx!.lineWidth = 1.2;
          ctx!.beginPath();
          ctx!.moveTo(pp.x, pp.y);
          ctx!.lineTo(p.x, p.y);
          ctx!.stroke();
        }
        const r = NODE_R[n.k] * p.s * scaleFit * 2.1;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, Math.max(0.8, r) + 3.5, 0, TAU);
        ctx!.strokeStyle = `rgba(${accent2[0]},${accent2[1]},${accent2[2]},0.95)`;
        ctx!.lineWidth = 1.2;
        ctx!.stroke();
      }
    }
  }

  if (reduced) {
    drawAt(ASSEMBLE + 601); // the finished assembly
  } else {
    // The yaw clock is scaled by the sleep factor, so idle decelerates to a stop, never a cut.
    let animT = 0;
    unregisterFrame = registerGatewayFrameClient(({ dtMs, factor }) => {
      if (disposed) return;
      frameDt = dtMs;
      if (!dragging) {
        userVel *= Math.exp(-dtMs / INERTIA_TAU_MS);
        userYaw += userVel;
      }
      animT += dtMs * factor;
      drawAt(animT);
    });
  }

  return {
    dispose(): void {
      disposed = true;
      unregisterFrame?.();
      removeEventListener('resize', onResize);
      boxObserver?.disconnect();
      canvas.removeEventListener('contextlost', onContextLost);
      canvas.removeEventListener('contextrestored', onContextRestored);
      if (tilt) {
        removeEventListener('pointermove', onLean);
        document.documentElement.removeEventListener('mouseleave', onLeanEnd);
        removeEventListener('blur', onLeanEnd);
      }
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    },
    setTyping(typed: number, total: number): void {
      const n = echoCount(typed, total, order.length);
      // Only ever added: a remounted headline's smaller count must not put out seen ink.
      for (let i = revealAt.size; i < n; i += 1) revealAt.set(order[i], lastT);
      if (reduced) drawAt(lastT);
    },
    litCount: () => revealAt.size,
    nodesOnScreen: () =>
      model.nodes.map((n) => {
        const p = lastProjected.get(n.s);
        return { s: n.s, k: n.k, x: p?.x ?? 0, y: p?.y ?? 0 };
      }),
  };
}
