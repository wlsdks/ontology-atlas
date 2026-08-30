/**
 * The hero object engine — **a depth projection of the real vault graph** (canvas 2D only).
 *
 * The argument: the hero object *is* the product. The four authorable kinds stack as planes on
 * the z axis (project / domain / capability / element), `contains` edges cross between planes,
 * and `depends` edges arc across the capability plane. Every node comes from `docs/ontology` —
 * **the same object** the instrument strip and caption count (the gateway's honesty contract).
 *
 * Depth grammar (no 3D library):
 *   - weak perspective division  s = f / (f + z)
 *   - ink attenuation by depth (far planes recede)
 *   - line-width attenuation
 *   - painter's order: far → near, edges beneath nodes
 *
 * Colours are read from CSS custom properties at mount, so the object follows automatically when
 * the accent token changes (indigo ↔ amber). No hex is written into the code.
 *
 * Motion budget: an autonomous yaw of one revolution per 48s plus drag inertia (a torsion spring
 * per plane). Under reduced-motion it draws a single still frame of the finished assembly —
 * only dragging (user-initiated movement, the WCAG 2.3.3 exception) redraws.
 *
 * Frames are supplied by the gateway's shared loop (`gateway-frame-loop.ts`) — the same single
 * rAF as the current field, decelerating over a 2s ramp and sleeping after 30s of no input (the
 * map's `ambient-sleep.ts` contract verbatim). Any input restores it on the next frame.
 *
 * Mockup measurements (scratchpad `hero-engine.js`, 2026-08-18): draw p50 0.4ms / p95 0.5ms,
 * zero dropped frames. This port is the typed version of that code and changes no visual grammar.
 */

import { registerGatewayFrameClient } from './gateway-frame-loop';
import { echoCount, echoOrder } from './hero-echo';

const TAU = Math.PI * 2;

export interface HeroGraphNode {
  /** slug — used only as a stable sort key and jitter seed. */
  s: string;
  k: 'project' | 'domain' | 'capability' | 'element';
  /** Filled in by layout (world coordinates). */
  px?: number;
  py?: number;
  pz?: number;
}

export interface HeroGraphEdge {
  a: string;
  b: string;
  y: 'contains' | 'depends';
}

export interface HeroGraphData {
  nodes: HeroGraphNode[];
  edges: HeroGraphEdge[];
}

export interface HeroEngineOptions {
  /** Element to read CSS tokens from; defaults to document.documentElement. */
  tokenEl?: Element;
  /** One revolution in ms. Default 48000 — a rotation to gaze at, not a carousel. */
  periodMs?: number;
  /** Overall ink multiplier (compensating for overlap on the stage). */
  inkScale?: number;
  /** The world fits within this many px (measured on the shorter side). */
  fitPx?: number;
  /** Force reduced-motion (for tests). Defaults to matchMedia. */
  forceReduced?: boolean;
  /**
   * The typing echo (Direction B, 2026-08-30): when true the object does not assemble on its
   * own clock — a dot lights only when `setTyping` has earned it (`hero-echo.ts`). Without it
   * the engine keeps its standalone per-tier assembly, so the object still works with no driver.
   */
  echo?: boolean;
  /** A fine pointer resting on a lit dot, or leaving it. Never fires while dragging. */
  onHover?: (slug: string | null) => void;
}

export interface HeroEngineHandle {
  dispose: () => void;
  /** How far the headline has been typed. Only read when `echo` is on. */
  setTyping: (typed: number, total: number) => void;
  /** Dots that have been lit so far — the echo's own count, for gates. */
  litCount: () => number;
  /** Where every node sat on the last drawn frame, in canvas CSS px — for gates. */
  nodesOnScreen: () => { s: string; k: HeroGraphNode['k']; x: number; y: number }[];
}

/** Deterministic hash → [0,1) — stable per-node jitter. */
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
  /**
   * The project apex y: 148 → 104 (owner, 2026-08-18: *[too much space at the top]*).
   *
   * Measured (1512, a 303px canvas): the top third of the ink (95px) held only 25% of the total —
   * the cone descending from the apex to the dome is only a thin spine, so although the bbox sat
   * dead centre (12px of margin above and below), to the eye it was an object "empty at the top
   * with the dome pushed down". The cause was neither placement nor projection but **dead space
   * in the shape**, so the apex drops 44 units toward the dome to tighten the cone. With a shorter
   * envelope the clamp raises the scale and the dome itself grows (ink width 290→324px measured) —
   * the grammar (apex, rings, spokes, dome) is unchanged.
   */
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

/** kind → plane; children fan out beneath their parent's angular slice. */
export function layoutHeroGraph(data: HeroGraphData): HeroModel {
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

  const parentOf = new Map<string, string>();
  for (const e of edges) {
    if (e.y !== 'contains') continue;
    const parent = bySlug.get(e.a);
    const child = bySlug.get(e.b);
    if (!parent || !child) continue;
    // An element prefers a capability parent (the fan comes out denser).
    if (child.k === 'element') {
      const prior = parentOf.get(e.b);
      if (prior && bySlug.get(prior)?.k === 'capability') continue;
    }
    parentOf.set(e.b, e.a);
  }

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
        // A crowded fan is split across two secondary rings.
        const r =
          ringR + (g.length > 4 ? (i % 2 ? 26 : -12) : 0) + (hash01(k.s) - 0.5) * 10;
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

/** While dragging, deeper planes follow slightly late (elastic torsion) — and then recover. */
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
  if (!ctx) return null; // jsdom or context exhaustion — leave the stage empty.

  const reduced =
    opts.forceReduced ??
    (typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches);
  const model = layoutHeroGraph(data);

  const rootEl = opts.tokenEl ?? document.documentElement;
  // The accent comes only from a token — the name says indigo but the value follows the switch.
  const accent = hexRgb(cssVar(rootEl, '--color-indigo-brand', '#5e6ad2'));
  const accent2 = hexRgb(cssVar(rootEl, '--color-indigo-accent', '#7170ff'));
  const ink = hexRgb(cssVar(rootEl, '--color-text-primary', '#f7f8f8'));
  const fill = hexRgb(cssVar(rootEl, '--color-panel', '#0f1011'));

  const PERIOD = opts.periodMs ?? 48000;
  const PITCH = 0.34;
  const F = 1050;
  const ASSEMBLE = 1600;
  const inkScale = opts.inkScale ?? 1;

  const cosP0 = Math.cos(PITCH);
  const sinP0 = Math.sin(PITCH);

  /**
   * The ink envelope (unit space) — the range of projected coordinates **before** multiplying by
   * `scaleFit`.
   *
   * Why it exists (owner, 2026-08-18: *[the part cut off at the bottom needs fixing]*): the world origin used to sit at the stage centre (H/2), but this
   * object's ink mass is not symmetric about the origin — the element dome (y=-150, r=224) is far
   * wider than the project apex (y=148), so measured at 1512 there were 39px of space above and
   * **0px below**, with the dome's bottom clipped by the instrument rule. Sampling a full
   * revolution of yaw gives an envelope that holds at every rotation and drag angle; then ① the
   * vertical centre moves to the envelope's centre and ② when the envelope exceeds the box, the
   * envelope rather than `fitPx` decides the scale (a clamp). The depends arc's lift (+46) sits
   * between the capability plane and the project apex, so it is inside the envelope.
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
      // The plane disc's rim — the ring line is drawn even at angles where no node sits.
      for (const kind of ['element', 'capability', 'domain'] as const) {
        const P = PLANE[kind];
        for (let i = 0; i < 24; i += 1) {
          const a = (i / 24) * TAU;
          consider(Math.cos(a) * P.r, P.y, Math.sin(a) * P.r, cy, sy, 0);
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
    // `fitPx` is «the size we want», the clamp below is «not clipped» — a scale where the
    // envelope exceeds the box is cut back, leaving 4% margin (see the envelope doc-block).
    const MARGIN = 0.04;
    const envW = Math.max(1, envelope.x1 - envelope.x0);
    const envH = Math.max(1, envelope.y1 - envelope.y0);
    scaleFit = Math.min(
      Math.min(W, H) / (opts.fitPx ?? 620),
      (W * (1 - MARGIN * 2)) / envW,
      (H * (1 - MARGIN * 2)) / envH,
    );
    // What is centred on the stage is not the world origin but **the ink envelope's centre**.
    centerX = W / 2 - ((envelope.x0 + envelope.x1) / 2) * scaleFit;
    centerY = H / 2 - ((envelope.y0 + envelope.y1) / 2) * scaleFit;
  }
  size();

  /**
   * The echo's ledger: the order dots light, and the engine clock at which each one did. A dot
   * fades in over `--motion-base` from its own moment, so a keystroke's dots start together and
   * two keystrokes' dots never share a frame — that is what makes the echo read as typing.
   */
  const echo = opts.echo === true;
  const order = echoOrder(model.nodes);
  const revealAt = new Map<string, number>();
  const REVEAL_MS = parseFloat(cssVar(rootEl, '--motion-base', '180ms')) || 180;

  /** The parent line of every node — the one stroke a pointed-at dot lights along with itself. */
  const parentOf = new Map<string, string>();
  for (const e of model.edges) if (e.y === 'contains' && !parentOf.has(e.b)) parentOf.set(e.b, e.a);

  let hover: string | null = null;
  /** A fine pointer within this many CSS px of a dot's centre is resting on it. */
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
    lastX = e.clientX;
    userVel = 0;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const setHover = (next: string | null): void => {
    if (next === hover) return;
    hover = next;
    opts.onHover?.(hover);
    if (reduced) drawAt(lastT);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) {
      // At rest the pointer reads, it does not turn: the nearest lit dot within reach lights.
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
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
      setHover(best);
      return;
    }
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    const d = dx * 0.006;
    userYaw += d;
    userVel = d;
    for (const k of KINDS) lag[k] += d * LAG_WEIGHT[k];
    if (reduced) drawAt(lastT); // only user-initiated movement redraws
  };
  const onPointerUp = (): void => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };
  const onPointerLeave = (): void => setHover(null);
  canvas.style.touchAction = 'pan-y';
  canvas.style.cursor = 'grab';
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

  const cosP = cosP0;
  const sinP = sinP0;
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
    // Not W/2 · H/2 but the envelope centre (`size()`'s centerX/centerY) — see the doc-block above.
    return { x: x * s * scaleFit + centerX, y: -y2 * s * scaleFit + centerY, s, z: z2 };
  }

  function tierAlpha(kind: HeroGraphNode['k'], t: number): number {
    if (reduced || t >= ASSEMBLE + 600) return 1;
    const dt = (t - TIER_DELAY[kind]) / 520;
    if (dt <= 0) return 0;
    if (dt >= 1) return 1;
    return 1 - (1 - dt) ** 3;
  }

  /** One node's ink at time t: its own echo moment when driven, its tier's when standalone. */
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
    ctx!.globalAlpha = inkScale;
    const yaw = (reduced ? 0.55 : (t / PERIOD) * TAU) + userYaw + 0.55;
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

    // Project everything first and normalize depth per frame — that makes the fog honest.
    const projected = new Map<string, Projected>();
    const alphaOf = new Map<string, number>();
    // A plane's disc is as present as its most present dot — it arrives with the tier's first.
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
    const zSpan = Math.max(1, zMax - zMin);
    // Near → 1, far → 0.09 (a squared family) — this contrast is what reads as 3D.
    const fog = (z: number): number => {
      const u = (z - zMin) / zSpan;
      return 0.09 + 0.91 * (1 - u) ** 1.8;
    };
    const lw = (z: number): number => {
      const u = (z - zMin) / zSpan;
      return 0.45 + 1.15 * (1 - u);
    };

    // 1 · plane discs plus a depth-shaded rim — the material of the stack.
    for (const kind of ['element', 'capability', 'domain'] as const) {
      const P = PLANE[kind];
      const a = tierMax[kind];
      if (a <= 0.01) continue;
      const pts: Projected[] = [];
      for (let i = 0; i <= 48; i += 1) {
        const ang = (i / 48) * TAU;
        pts.push(
          project(Math.cos(ang) * P.r, P.y, Math.sin(ang) * P.r, trig[kind][0], trig[kind][1]),
        );
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const p of pts) {
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      ctx!.beginPath();
      pts.forEach((p, i) => (i ? ctx!.lineTo(p.x, p.y) : ctx!.moveTo(p.x, p.y)));
      ctx!.closePath();
      const lg = ctx!.createLinearGradient(x0, y0, x1, y1); // light source at the top left
      lg.addColorStop(0, `rgba(${ink[0]},${ink[1]},${ink[2]},${0.034 * a})`);
      lg.addColorStop(1, `rgba(${ink[0]},${ink[1]},${ink[2]},${0.004 * a})`);
      ctx!.fillStyle = lg;
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

    // 2 · contains edges, far → near.
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
      const spine = ka === 'project' || kb === 'project';
      ctx!.strokeStyle = spine
        ? `rgba(${accent[0]},${accent[1]},${accent[2]},${(0.2 + 0.28 * f) * a})`
        : `rgba(${ink[0]},${ink[1]},${ink[2]},${0.24 * f * a})`;
      ctx!.lineWidth = lw(it.z) * 0.85;
      ctx!.beginPath();
      ctx!.moveTo(it.A.x, it.A.y);
      ctx!.lineTo(it.B.x, it.B.y);
      ctx!.stroke();
    }

    // 3 · depends edges — an accent arc lifted above the capability plane with a slow dash
    //     current (the same grammar as the map section's .flow pulse: dash motion, not glow).
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

    // 4 · nodes, far → near.
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
    // An accent-stroked hexagon — the same vocabulary as the map section.
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

    // 5 · the pointed-at dot: its parent line in full accent and a ring one step outside it.
    //     A stroke ring, not a shadow — the same vocabulary as the map's selection.
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
    drawAt(ASSEMBLE + 601); // one still frame of the finished assembly
  } else {
    // Ride the gateway's shared loop — the same single rAF as the current field. The autonomous
    // yaw advances by an accumulated clock multiplied by the sleep factor, so after 30s of no
    // input it decelerates over a 2s ramp and stops (no step cut), and once asleep the frame
    // itself is skipped. Drag and inertia live where the factor is always 1, right after input.
    // See the `gateway-frame-loop.ts` doc-block.
    let animT = 0;
    unregisterFrame = registerGatewayFrameClient(({ dtMs, factor }) => {
      if (disposed) return;
      if (!dragging) {
        userVel *= 0.94;
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
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
    },
    setTyping(typed: number, total: number): void {
      const n = echoCount(typed, total, order.length);
      // Dots are only ever added: a re-render that reports a smaller count (a remount of the
      // headline) does not put out ink the reader has already seen.
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
