import { domainFlows, reachOf, type FilmConcept, type FilmReach, type FilmVault } from './film-vault';
import {
  bowedPoints,
  circleIntoRect,
  crossings,
  dist,
  distanceToRect,
  grow,
  inside,
  overlaps,
  pointAlong,
  polylineLength,
  resample,
  trim,
  type Pt,
  type Rect,
} from './film-geometry';

/**
 * The film's map, laid out once per stage size and locale: the product's Flat map mark for mark,
 * placed so that no name, mark or line runs over another. Deterministic and seedless: the same
 * vault and stage give the same picture. Cost: the slot order tries every order of up to six
 * domains (d! orders, greedy beyond); label admission is O(n^2) over at most about sixty boxes.
 */

export interface FilmMarkTokens {
  domainDiscPx: number;
  domainCorePx: number;
  domainRimPx: number;
  projectDiscPx: number;
  projectCorePx: number;
  capDiscMinPx: number;
  capDiscGainPx: number;
  capDiscMaxPx: number;
  capRimPx: number;
  capCoreInsetPx: number;
  capCoreMinPx: number;
  elementDotPx: number;
  selectedDiscPx: number;
  selectedRingGapPx: number;
  selectedRingPx: number;
  lineTaperPx: number;
  lineTaperGainPx: number;
  lineTaperMaxPx: number;
  lineDotPx: number;
  lineDotGapPx: number;
  lightAlpha: number;
  lightReach: number;
  restHue: number;
  /** The film's mark growth over the product's sizes (`--map-graph-film-growth`). */
  growth: number;
  /** Ink share kept by unrelated clusters while lit (`--map-graph-film-sink`). */
  sink: number;
}

export type Measure = (text: string, font: string) => number;
export type InkRole = 'primary' | 'secondary' | 'tertiary' | 'name' | 'strong' | 'arc' | 'reach' | 'agent';
export type LabelRole = 'domain' | 'units' | 'project' | 'cap' | 'pick' | 'reach' | 'end' | 'agent' | 'tool';

export interface LabelSegment {
  text: string;
  ink: InkRole;
}

export interface FilmLabel {
  key: string;
  /** The concept it names; null for the agent's tag. */
  id: string | null;
  role: LabelRole;
  segments: LabelSegment[];
  font: string;
  size: number;
  /** The anchor: `x` by `align`, `y` the text's middle. */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  box: Rect;
}

export interface FilmMark {
  id: string;
  kind: FilmConcept['kind'];
  x: number;
  y: number;
  r: number;
  domain: string | null;
}

export interface FilmCluster {
  id: string;
  x: number;
  y: number;
  footprint: number;
  nameBlock: Rect;
}

export interface FilmArc {
  from: string;
  to: string;
  count: number;
  pts: Pt[];
  width: number;
  /** Where its count stands; null where no clear spot exists on the arc, which then carries none. */
  numeral: Pt | null;
}

export type LitKind = 'needs' | 'neededBy' | 'relates' | 'own';

export interface FilmLitLine {
  end: string;
  kind: LitKind;
  /** From the pick outward, whatever the line's direction; `towardPick` says which way it reads. */
  pts: Pt[];
  width: number;
  towardPick: boolean;
}

export interface FilmLit {
  pick: string;
  reach: FilmReach;
  selectedR: number;
  rings: [number, number];
  agentR: number;
  ownDots: Map<string, Pt>;
  lines: FilmLitLine[];
  ends: string[];
  /** Capabilities that hold an element end: back to 0.6 ink so the dot has an owner. */
  owners: string[];
  labels: FilmLabel[];
  leader: { from: Pt; to: Pt } | null;
  pointer: Pt;
  pointerBox: Rect;
  keys: { x: number; y: number; ink: 'project' | 'agent' }[];
}

export interface FilmSizes {
  wide: boolean;
  s: number;
  K: number;
  safe: number;
  domainR: number;
  domainCore: number;
  domainRim: number;
  projectR: number;
  projectCore: number;
  capRim: number;
  elemR: number;
  rings: [number, number, number];
  elemGap: number;
  elemAlt: number;
  fDomain: number;
  fUnits: number;
  fProject: number;
  fCap: number;
  fPick: number;
  fReach: number;
  fTag: number;
  fNumeral: number;
  numeralR: number;
}

export interface FilmMapLayout {
  sizes: FilmSizes;
  w: number;
  h: number;
  titleBox: Rect;
  captionBox: Rect;
  order: string[];
  marks: Map<string, FilmMark>;
  clusters: FilmCluster[];
  stems: { from: string; to: string; alpha: number }[];
  restArcs: FilmArc[];
  restLabels: FilmLabel[];
  lit: FilmLit | null;
  pick: string | null;
  capRadius: (elements: number) => number;
}

export interface FilmCopy {
  units: (capabilities: number, elements: number) => string;
  reach: (needs: number, neededBy: number) => LabelSegment[];
  agent: string;
  tool: string;
}

export interface FilmLayoutInput {
  vault: FilmVault;
  pick: string | null;
  w: number;
  h: number;
  locale: string;
  title: Rect;
  /** The union of every act's headline, act 4's second line and the act bar. */
  caption: Rect;
  measure: Measure;
  sans: string;
  mono: string;
  tokens: FilmMarkTokens;
  copy: FilmCopy;
}

export const WIDE_PX = 720;
const DEG = Math.PI / 180;
const FAN_STEP = 0.42;
const GATE_HALF = 26 * DEG;
const HUB_HALF = 32 * DEG;
const PHONE_UNITS_MAX = 160;
const LABEL_PAD = 4;
const NAME_GAP = 7;
const CROSSING_COST = 4000;
const REST_NAMES_PX = 1400;
const NUMERAL_SPOTS = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74];

/** `fit` draws a cluster's rings closer on a stage too small for their full spread; names keep their size. */
export function filmSizes(w: number, h: number, tokens: FilmMarkTokens, fit = 1): FilmSizes {
  const wide = w >= WIDE_PX;
  const s = Math.min(1, Math.max(0.74, Math.min(w / 1920, h / 960)));
  const K = wide ? tokens.growth * s : 0.84;
  const D = wide ? K : 0.8;
  return {
    wide,
    s,
    K,
    safe: wide ? 32 : 16,
    domainR: tokens.domainDiscPx * D,
    domainCore: tokens.domainCorePx * D,
    domainRim: tokens.domainRimPx * D,
    projectR: tokens.projectDiscPx * D,
    projectCore: tokens.projectCorePx * D,
    capRim: tokens.capRimPx * K,
    elemR: wide ? tokens.elementDotPx * K : Math.max(1.5, tokens.elementDotPx * K),
    rings: wide ? [86 * s * fit, 122 * s * fit, 156 * s * fit] : [38, 54, 70],
    elemGap: wide ? 10 * s : 6,
    elemAlt: wide ? 7 * s : 5,
    fDomain: wide ? Math.max(22, 26 * s) : 15,
    fUnits: wide ? 15 : 13,
    fProject: wide ? Math.max(17, 20 * s) : 14,
    fCap: wide ? 15 : 13,
    fPick: wide ? Math.max(18, 21 * s) : 15,
    fReach: wide ? 15 : 13,
    fTag: wide ? 15 : 13,
    fNumeral: wide ? 15 : 13,
    numeralR: wide ? 11 : 10,
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const norm = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const angleGap = (a: number, b: number) => {
  const d = norm(a - b);
  return Math.min(d, Math.PI * 2 - d);
};

const fontOf = (weight: number, size: number, family: string) => `${weight} ${size}px ${family}`;

function makeLabel(
  measure: Measure,
  key: string,
  id: string | null,
  role: LabelRole,
  segments: LabelSegment[],
  font: string,
  size: number,
  x: number,
  y: number,
  align: FilmLabel['align'],
): FilmLabel {
  const w = segments.reduce((sum, seg) => sum + measure(seg.text, font), 0);
  const l = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
  return { key, id, role, segments, font, size, x, y, align, box: { l, t: y - size * 0.62, r: l + w, b: y + size * 0.62 } };
}

class Field {
  readonly boxes: Rect[] = [];
  readonly marks: { x: number; y: number; r: number }[] = [];
  samples: Pt[] = [];
  readonly bounds: Rect;
  readonly forbidden: Rect[];
  constructor(bounds: Rect, forbidden: Rect[]) {
    this.bounds = bounds;
    this.forbidden = forbidden;
  }

  free(box: Rect): boolean {
    const padded = grow(box, LABEL_PAD);
    if (padded.l < this.bounds.l || padded.r > this.bounds.r || padded.t < this.bounds.t || padded.b > this.bounds.b) return false;
    if (this.forbidden.some((rect) => overlaps(padded, rect))) return false;
    if (this.boxes.some((rect) => overlaps(padded, rect))) return false;
    if (this.marks.some((m) => circleIntoRect(m, m.r, padded) > 0)) return false;
    return !this.samples.some((p) => inside(p, padded));
  }

  take(box: Rect) {
    this.boxes.push(grow(box, LABEL_PAD));
  }
}

interface Item {
  id: string;
  a: number;
  d: number;
  r: number;
  elements: string[];
  gate?: boolean;
}

interface FilmPlacement {
  marks: Map<string, FilmMark>;
  clusters: FilmCluster[];
}

interface LocalCluster {
  id: string;
  items: Item[];
  /** Elements the domain holds without a capability, just above its disc. */
  direct: string[];
  footprint: number;
  nameBlock: Rect;
  rows: { text: string; font: string; size: number; dy: number; role: 'domain' | 'units'; key: string }[];
}

function itemReach(item: Item, S: FilmSizes): number {
  return item.r + (item.elements.length ? S.elemGap + S.elemAlt + S.elemR * 2 : 0);
}

function upReach(local: LocalCluster, S: FilmSizes): number {
  let up = S.domainR;
  for (const it of local.items) {
    const y = Math.sin(it.a) * it.d;
    up = Math.max(up, it.r - y);
    for (const o of dotOffsets(it.elements.length, it.a, it.r, S)) up = Math.max(up, S.elemR - y - o.y);
  }
  if (local.direct.length) up = Math.max(up, S.domainR + S.elemGap + S.elemR * 3);
  return up;
}

export function dotOffsets(count: number, away: number, r: number, S: FilmSizes, from = r + S.elemGap): Pt[] {
  return Array.from({ length: count }, (_, k) => {
    const a = away + (k - (count - 1) / 2) * FAN_STEP;
    const d = from + (k % 2) * S.elemAlt;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  });
}

function localCluster(
  input: FilmLayoutInput,
  S: FilmSizes,
  domain: FilmConcept,
  capRadius: (e: number) => number,
  gate: number | null,
  hub: number | null = null,
): LocalCluster {
  const { vault, pick, measure, sans, locale } = input;
  const caps = vault.capabilities.filter((c) => c.domain === domain.id && !(gate !== null && c.id === pick));
  const n = caps.length;
  const titleHalf = (S.wide ? (locale === 'en' ? 54 : 44) : 38) * DEG;
  const cuts: [number, number][] = [[Math.PI / 2 - titleHalf, Math.PI / 2 + titleHalf]];
  if (gate !== null) cuts.push([gate - GATE_HALF, gate + GATE_HALF]);
  /* On a phone the clusters stand close to the project: none of their marks faces it. */
  if (hub !== null && !S.wide) cuts.push([hub - HUB_HALF, hub + HUB_HALF]);
  const blocked = (a: number) => cuts.some(([l, r]) => norm(a - l) < norm(r - l));
  const STEPS = 720;
  const free: [number, number][] = [];
  let run: [number, number] | null = null;
  const start = Math.PI / 2 + titleHalf;
  for (let i = 0; i <= STEPS; i += 1) {
    const a = start + (i / STEPS) * Math.PI * 2;
    if (i < STEPS && !blocked(a)) {
      if (!run) run = [a, a];
      run[1] = a;
    } else if (run) {
      free.push(run);
      run = null;
    }
  }
  const total = free.reduce((sum, [l, r]) => sum + (r - l), 0);
  const angleAt = (u: number) => {
    let left = u * total;
    for (const [l, r] of free) {
      if (left <= r - l) return l + left;
      left -= r - l;
    }
    return free[free.length - 1]?.[1] ?? 0;
  };

  const nameFont = fontOf(650, S.fDomain, sans);
  const unitsFont = fontOf(400, S.fUnits, sans);
  const capCount = vault.capabilities.filter((c) => c.domain === domain.id).length;
  const elemCount = vault.elements.filter((e) => e.domain === domain.id).length;
  const units = input.copy.units(capCount, elemCount);
  /* On a phone a count row wider than half the stage breaks at its separator onto two lines. */
  const parts = units.split(' · ');
  const unitRows = !S.wide && parts.length === 2 && measure(units, unitsFont) > PHONE_UNITS_MAX ? parts : [units];
  const nameTop = S.domainR + 10;
  const nameH = S.fDomain * 1.24;
  const unitsTop = nameTop + nameH + 2;
  const unitsH = S.fUnits * 1.24;
  const blockW = Math.max(measure(domain.label, nameFont), ...unitRows.map((row) => measure(row, unitsFont)));
  const nameBlock: Rect = { l: -blockW / 2 - LABEL_PAD, t: nameTop - LABEL_PAD, r: blockW / 2 + LABEL_PAD, b: unitsTop + unitsH * unitRows.length + LABEL_PAD };
  const rows = [
    { text: domain.label, font: nameFont, size: S.fDomain, dy: nameTop + nameH / 2, role: 'domain' as const, key: 'domain' },
    ...unitRows.map((text, k) => ({ text, font: unitsFont, size: S.fUnits, dy: unitsTop + unitsH * k + unitsH / 2, role: 'units' as const, key: k ? `units${k + 1}` : 'units' })),
  ];

  /* Heaviest third on the outer ring, the middle third inside, the lightest between. */
  const ranked = [...caps].sort((a, b) => b.elements.length - a.elements.length || (a.id < b.id ? -1 : 1));
  const band = new Map(ranked.map((c, i) => [c.id, i < n / 3 ? 2 : i < (2 * n) / 3 ? 0 : 1]));
  const pools = [0, 1, 2].map((b) =>
    caps.filter((c) => band.get(c.id) === b).sort((x, y) => hash(x.id) - hash(y.id)),
  );
  const pattern = [2, 0, 1, 0];
  const dealt: FilmConcept[] = [];
  for (let i = 0; dealt.length < n; i += 1) {
    let b = pattern[i % 4]!;
    for (let k = 0; k < 3 && pools[b]!.length === 0; k += 1) b = (b + 1) % 3;
    dealt.push(pools[b]!.shift()!);
  }
  const items: Item[] = dealt.map((c, i) => ({
    id: c.id,
    a: angleAt((i + 0.5) / Math.max(1, n)) + (hash(`${c.id}#a`) - 0.5) * (total / Math.max(1, n)) * 0.3,
    d: S.rings[band.get(c.id)!]! * (1 + (hash(`${c.id}#r`) - 0.5) * 0.12),
    r: capRadius(c.elements.length),
    elements: c.elements,
  }));
  /* No mark may touch the name block: a capability that would moves along its ring to clear it. */
  const touches = (item: Item, a: number) => {
    const q = { x: Math.cos(a) * item.d, y: Math.sin(a) * item.d };
    if (circleIntoRect(q, item.r + 2, nameBlock) > 0) return true;
    return dotOffsets(item.elements.length, a, item.r, S).some((o) => circleIntoRect({ x: q.x + o.x, y: q.y + o.y }, S.elemR + 2, nameBlock) > 0);
  };
  for (const item of items) {
    if (!touches(item, item.a)) continue;
    for (let step = 1; step <= 180; step += 1) {
      const a = item.a + (step % 2 ? 1 : -1) * Math.ceil(step / 2) * DEG;
      if (!touches(item, a)) {
        item.a = a;
        break;
      }
    }
  }
  if (gate !== null && pick) {
    const c = vault.byId.get(pick)!;
    const item: Item = { id: c.id, a: gate, d: S.rings[2] * (S.wide ? 1.42 : 1.3), r: capRadius(c.elements.length), elements: c.elements, gate: true };
    const away = Math.sin(gate - Math.PI / 2) >= 0 ? 1 : -1;
    for (let step = 0; step < 90 && touches(item, item.a); step += 1) item.a += away * DEG;
    items.push(item);
  }
  const footprint = Math.max(S.domainR + 8, ...items.filter((it) => !it.gate).map((it) => it.d + itemReach(it, S)));
  const direct = vault.elements.filter((e) => e.domain === domain.id && !e.capability).map((e) => e.id);
  return { id: domain.id, items, direct, footprint, nameBlock, rows };
}

export function slotOrder(vault: FilmVault, first: string | null): string[] {
  const ids = vault.domains.map((d) => d.id);
  if (ids.length <= 1) return ids;
  const flows = domainFlows(vault);
  const pair = (a: string, b: string) =>
    flows.filter((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a)).reduce((sum, f) => sum + f.count, 0);
  const head = first && ids.includes(first) ? first : ids[0]!;
  const rest = ids.filter((id) => id !== head);
  const cost = (ring: string[]) => {
    let c = 0;
    for (let i = 0; i < ring.length; i += 1)
      for (let j = i + 1; j < ring.length; j += 1) c += pair(ring[i]!, ring[j]!) * Math.min(j - i, ring.length - (j - i));
    return c;
  };
  if (ids.length <= 6) {
    const perms = (xs: string[]): string[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    let best: string[] = [head, ...rest];
    let least = Infinity;
    for (const p of perms(rest)) {
      const ring = [head, ...p];
      const c = cost(ring);
      if (c < least - 1e-9) {
        least = c;
        best = ring;
      }
    }
    return best;
  }
  const ring = [head];
  const left = new Set(rest);
  while (left.size) {
    const last = ring[ring.length - 1]!;
    const next = [...left].sort((a, b) => pair(last, b) - pair(last, a) || (a < b ? -1 : 1))[0]!;
    ring.push(next);
    left.delete(next);
  }
  return ring;
}

export function layoutFilmMap(input: FilmLayoutInput): FilmMapLayout {
  const { vault, w, h, measure, sans, mono, tokens, copy } = input;
  let S = filmSizes(w, h, tokens);
  const capRadius = (e: number) =>
    Math.min(tokens.capDiscMaxPx, tokens.capDiscMinPx + tokens.capDiscGainPx * Math.sqrt(e)) * S.K;
  const pick = input.pick && vault.byId.get(input.pick)?.domain ? input.pick : null;
  const pickDomain = pick ? vault.byId.get(pick)!.domain : null;
  const titleBox = grow(input.title, 16);
  const captionBox = grow(input.caption, 24);
  const bounds: Rect = { l: S.safe, t: S.safe, r: w - S.safe, b: h - S.safe };
  const mapTop = Math.max(S.safe, titleBox.b);
  const mapBottom = S.wide ? h - S.safe : captionBox.t - 76;
  const order = slotOrder(vault, pickDomain);
  const flows = domainFlows(vault).slice(0, 6);
  const arcBows = S.wide ? [0.16, 0.26, 0.36, 0.46, 0.06, 0.1, 0.12, 0.2] : [0.2, 0.34, 0.48, 0.1, 0.14, 0.26];
  /*
   * The spec's ellipse first (a phone also tries its tilts toward a two-by-two grid). A stage it
   * cannot hold, short or narrow and tall, then draws the clusters tighter and tries other tilts,
   * measuring the top cluster by its marks and letting the ellipse widen, before anything collides.
   */
  const attempts: { fit: number; tiltDeg: number; adapt: boolean }[] = S.wide
    ? [
        { fit: 1, tiltDeg: -10, adapt: false },
        ...[1, 0.9, 0.8, 0.72, 0.64, 0.56].flatMap((fit) => [-10, -20, 0, -30, -40].map((tiltDeg) => ({ fit, tiltDeg, adapt: true }))),
      ]
    : [
        ...[-25, -32, -39, -45].map((tiltDeg) => ({ fit: 1, tiltDeg, adapt: false })),
        /* A phone too narrow for two columns stacks the four as a slalom, each a step lower than the last. */
        ...[-25, -39, -52, -60, -68].map((tiltDeg) => ({ fit: 1, tiltDeg, adapt: true })),
      ];
  type Attempt = (typeof attempts)[number];
  type Placement = { locals: Map<string, LocalCluster>; placed: FilmPlacement; value: number; S: FilmSizes };
  const tryAttempt = ({ fit, tiltDeg, adapt }: Attempt, grain: number): Placement => {
    S = filmSizes(w, h, tokens, fit);
    const tilt = tiltDeg * DEG;
    const slotAngle = new Map(order.map((id, i) => [id, -Math.PI / 2 + tilt + (i / Math.max(1, order.length)) * Math.PI * 2]));

    /* An adapted ellipse is stretched so its highest and lowest clusters, not its poles, meet the frame's top and bottom. */
    const sins = order.map((id) => Math.sin(slotAngle.get(id)!));
    const coss = order.map((id) => Math.abs(Math.cos(slotAngle.get(id)!)));
    const sinMin = adapt && order.length > 1 ? Math.min(...sins) : -1;
    const sinMax = adapt && order.length > 1 ? Math.max(...sins) : 1;
    const cosMax = adapt && order.length > 1 ? Math.max(0.2, ...coss) : 1;
    const ellipse = (yTop: number, yBottom: number, rx: number) => {
      const ry = Math.max(0, (yBottom - yTop) / Math.max(0.2, sinMax - sinMin));
      return { cy: yTop - sinMin * ry, ry, rx: rx / cosMax };
    };
    const hubOf = (id: string) => (order.length > 1 ? norm((slotAngle.get(id) ?? 0) + Math.PI) : null);
    let locals = new Map(vault.domains.map((d) => [d.id, localCluster(input, S, d, capRadius, null, hubOf(d.id))]));
    const reachOfAll = () => Math.max(S.domainR * 2, ...[...locals.values()].map((c) => c.footprint));
    const titleDrop = Math.max(0, ...[...locals.values()].map((c) => c.nameBlock.b));

    const frame = (maxReach: number) => {
      const mapL = S.safe;
      const mapR = w - S.safe;
      /* The top slot's own reach sets the ellipse's top: a lighter top cluster leaves more room between rows. */
      const top = locals.get(adapt ? (order[sins.indexOf(Math.min(...sins))] ?? '') : (order[0] ?? ''));
      const topReach = Math.min(maxReach, top ? (adapt ? upReach(top, S) : top.footprint) : maxReach);
      const yTop = mapTop + topReach + (S.wide ? 4 : 2);
      const yBottom = mapBottom - Math.max(titleDrop + 8, maxReach * (S.wide ? 0.78 : 0.8));
      /* The spec's side margin on a full stage; a narrower one gives it back to the clusters. */
      const side = 96 * S.s * (adapt ? Math.min(1, Math.max(0, (mapR - mapL - 700) / 600)) : 1);
      const rx = S.wide ? Math.min((mapR - mapL) / 2 - maxReach - side, 560 * S.s) : (mapR - mapL) / 2 - maxReach + 6;
      return { cx: (mapL + mapR) / 2 + (S.wide ? 10 * S.s : 0), yTop, yBottom, rx: Math.max(0, rx) };
    };

    if (pick && pickDomain) {
      const base = frame(reachOfAll());
      const { cy, ry, rx: rxe } = ellipse(base.yTop, base.yBottom, base.rx);
      const at = (id: string) => {
        const a = slotAngle.get(id) ?? 0;
        return { x: base.cx + Math.cos(a) * rxe, y: cy + Math.sin(a) * ry };
      };
      const reach = reachOf(vault, pick);
      const tally = new Map<string, number>();
      for (const end of [...reach.needs, ...reach.neededBy, ...reach.relates]) {
        const d = vault.byId.get(end)?.domain;
        if (d && d !== pickDomain) tally.set(d, (tally.get(d) ?? 0) + 1);
      }
      const target = [...tally.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]?.[0];
      const home = at(pickDomain);
      const toward = target ? at(target) : { x: base.cx, y: cy };
      let gate = norm(Math.atan2(toward.y - home.y, toward.x - home.x));
      const titleHalf = (S.wide ? (input.locale === 'en' ? 54 : 44) : 38) * DEG;
      const lo = Math.PI / 2 - titleHalf - GATE_HALF;
      const hi = Math.PI / 2 + titleHalf + GATE_HALF;
      if (gate > lo && gate < hi) gate = gate - lo < hi - gate ? lo : hi;
      /* The lit pick and its pushed-out dots stay on the stage: the gate turns toward the map's centre until they do. */
      const gateD = S.rings[2] * (S.wide ? 1.42 : 1.3);
      const pickC = vault.byId.get(pick)!;
      const ringK = S.wide ? S.K : 0.84;
      const litR = Math.max(capRadius(pickC.elements.length), 11 * ringK) + 11 * ringK + 5 + S.elemAlt + S.elemR * 2;
      const inStage = (g: number) => {
        const x = home.x + Math.cos(g) * gateD;
        const y = home.y + Math.sin(g) * gateD;
        return x - litR >= S.safe && x + litR <= w - S.safe && y - litR >= mapTop && y + litR <= mapBottom;
      };
      if (!inStage(gate)) {
        const inName = (g: number) => g > lo && g < hi;
        for (let step = 1; step <= 60; step += 1) {
          const turned = [norm(gate + step * 3 * DEG), norm(gate - step * 3 * DEG)].find((g) => !inName(g) && inStage(g));
          if (turned !== undefined) {
            gate = turned;
            break;
          }
        }
      }
      const domain = vault.byId.get(pickDomain)!;
      locals = new Map(locals);
      locals.set(pickDomain, localCluster(input, S, domain, capRadius, gate, hubOf(pickDomain)));
    }

    const maxReach = reachOfAll();
    const base = frame(maxReach);

    /** Every mark and name block for an ellipse; null when something falls outside the map. */
    const settleGate = (p: Pt, it: Item, local: LocalCluster, others: { p: Pt; block: Rect }[]) => {
      const ringK = S.wide ? S.K : 0.84;
      const litR = Math.max(it.r, 11 * ringK) + 11 * ringK + 5 + S.elemAlt + S.elemR * 2;
      const titleHalf = (S.wide ? (input.locale === 'en' ? 54 : 44) : 38) * DEG;
      const lo = Math.PI / 2 - titleHalf - GATE_HALF;
      const hi = Math.PI / 2 + titleHalf + GATE_HALF;
      const block: Rect = { l: p.x + local.nameBlock.l, t: p.y + local.nameBlock.t, r: p.x + local.nameBlock.r, b: p.y + local.nameBlock.b };
      const clear = (g: number) => {
        const x = p.x + Math.cos(g) * it.d;
        const y = p.y + Math.sin(g) * it.d;
        if (x - litR < S.safe || x + litR > w - S.safe || y - litR < mapTop || y + litR > mapBottom) return false;
        if (circleIntoRect({ x, y }, litR + 2, block) > 0) return false;
        return others.every((o) => circleIntoRect({ x, y }, litR + 2, o.block) === 0 && dist({ x, y }, o.p) > litR + S.domainR + 6);
      };
      if (clear(it.a)) return it.a;
      for (let step = 1; step <= 60; step += 1) {
        const turned = [norm(it.a + step * 3 * DEG), norm(it.a - step * 3 * DEG)].find((g) => !(g > lo && g < hi) && clear(g));
        if (turned !== undefined) return turned;
      }
      return it.a;
    };
    const centres = (cx: number, yTop: number, yBottom: number, rx0: number): FilmCluster[] => {
      const { cy, ry, rx } = ellipse(yTop, yBottom, rx0);
      return order.map((id) => {
        const a = slotAngle.get(id)!;
        const p = order.length === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
        const local = locals.get(id)!;
        const nb = local.nameBlock;
        return { id, x: p.x, y: p.y, footprint: local.footprint, nameBlock: { l: p.x + nb.l, t: p.y + nb.t, r: p.x + nb.r, b: p.y + nb.b } };
      });
    };
    const place = (cx: number, yTop: number, yBottom: number, rx0: number) => {
      const { cy, ry, rx } = ellipse(yTop, yBottom, rx0);
      const marks = new Map<string, FilmMark>();
      const clusters: FilmCluster[] = [];
      if (vault.project) marks.set(vault.project.id, { id: vault.project.id, kind: 'project', x: cx, y: cy, r: S.projectR, domain: null });
      const at = new Map(
        order.map((id) => {
          const a = slotAngle.get(id)!;
          const p = order.length === 1 ? { x: cx, y: cy } : { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
          const nb = locals.get(id)!.nameBlock;
          return [id, { p, block: { l: p.x + nb.l, t: p.y + nb.t, r: p.x + nb.r, b: p.y + nb.b } }] as const;
        }),
      );
      for (const id of order) {
        const local = locals.get(id)!;
        const p = at.get(id)!.p;
        marks.set(id, { id, kind: 'domain', x: p.x, y: p.y, r: S.domainR, domain: id });
        clusters.push({
          id,
          x: p.x,
          y: p.y,
          footprint: local.footprint,
          nameBlock: { l: p.x + local.nameBlock.l, t: p.y + local.nameBlock.t, r: p.x + local.nameBlock.r, b: p.y + local.nameBlock.b },
        });
        for (const it of local.items) {
          const a = it.gate ? settleGate(p, it, local, [...at.entries()].filter(([o]) => o !== id).map(([, v]) => v)) : it.a;
          const q = { x: p.x + Math.cos(a) * it.d, y: p.y + Math.sin(a) * it.d };
          marks.set(it.id, { id: it.id, kind: 'capability', x: q.x, y: q.y, r: it.r, domain: id });
          dotOffsets(it.elements.length, a, it.r, S).forEach((o, k) => {
            const e = it.elements[k]!;
            marks.set(e, { id: e, kind: 'element', x: q.x + o.x, y: q.y + o.y, r: S.elemR, domain: id });
          });
        }
        local.direct.forEach((e, k) => {
          const ea = -Math.PI / 2 + (k - (local.direct.length - 1) / 2) * 0.5;
          const d = S.domainR + S.elemGap + S.elemR * 2;
          marks.set(e, { id: e, kind: 'element', x: p.x + Math.cos(ea) * d, y: p.y + Math.sin(ea) * d, r: S.elemR, domain: id });
        });
      }
      return { marks, clusters };
    };

    const corridor = (placed: ReturnType<typeof place>, from: string, to: string) => {
      const A = placed.clusters.find((c) => c.id === from);
      const B = placed.clusters.find((c) => c.id === to);
      const hub = vault.project ? placed.marks.get(vault.project.id) : undefined;
      if (!A || !B) return true;
      const chord = dist(A, B);
      const nameW = hub && vault.project ? measure(vault.project.label, fontOf(600, S.fProject, sans)) : 0;
      const hubName: Rect | null = hub
        ? { l: hub.x - nameW / 2 - 8, t: hub.y - hub.r * 1.35 - 12 - S.fProject * 1.3, r: hub.x + nameW / 2 + 8, b: hub.y }
        : null;
      const cut = (c: FilmCluster) => Math.min(c.footprint * (S.wide ? 0.9 : 1), chord * 0.38);
      return arcBows.some((mag) =>
        [mag, -mag].some((bow) =>
          trim(bowedPoints(A, B, bow, 48), A, cut(A), B, cut(B)).every(
            (p) =>
              placed.clusters.every((c) => c.id === from || c.id === to || dist(p, c) >= c.footprint + 2) &&
              (!hub || dist(p, hub) >= hub.r * 1.35 + 34) &&
              !(hubName && inside(p, hubName)) &&
              placed.clusters.every((c) => !inside(p, grow(c.nameBlock, 4))) &&
              inside(p, bounds) &&
              !inside(p, captionBox),
          ),
        ),
      );
    };

    const crowded = (placed: ReturnType<typeof place>, a: FilmCluster, b: FilmCluster) => {
      const A: FilmMark[] = [];
      const B: FilmMark[] = [];
      for (const m of placed.marks.values()) {
        if (m.domain === a.id && dist(m, b) < b.footprint + m.r + 8) A.push(m);
        else if (m.domain === b.id && dist(m, a) < a.footprint + m.r + 8) B.push(m);
      }
      for (const p of A) for (const q of B) if (dist(p, q) < p.r + q.r + 8) return true;
      return false;
    };
    const hubW = vault.project ? measure(vault.project.label, fontOf(510, S.fProject, sans)) : 0;

    const blockFaults = (clusters: FilmCluster[], limit = Infinity) => {
      let n = 0;
      const fault = () => {
        n += 1;
        return n >= limit;
      };
      for (let i = 0; i < clusters.length; i += 1) {
        const c = clusters[i]!;
        const nb = c.nameBlock;
        if ((nb.l < S.safe || nb.r > w - S.safe || nb.b > mapBottom || overlaps(nb, captionBox)) && fault()) return n;
        /* A cluster's light centre stays clear of the caption by most of its footprint; its marks clear it entirely. */
        if (S.wide && distanceToRect(c, captionBox) < c.footprint * 0.75 && fault()) return n;
        for (let j = i + 1; j < clusters.length; j += 1) if (overlaps(grow(nb, 4), clusters[j]!.nameBlock) && fault()) return n;
      }
      return n;
    };

    /** How many of the map's other hard rules a placement breaks, counted up to `limit`: 0 is a fit. Cheapest rules first. */
    const faults = (placed: ReturnType<typeof place>, limit = Infinity) => {
      const box: Rect = { l: S.safe, t: mapTop, r: w - S.safe, b: mapBottom };
      let n = 0;
      const fault = () => {
        n += 1;
        return n >= limit;
      };
      const { clusters } = placed;
      const hub = vault.project ? placed.marks.get(vault.project.id) : undefined;
      if (hub) {
        const lift = hub.r * 1.35;
        const above: Rect = { l: hub.x - hubW / 2 - 6, t: hub.y - lift - 12 - S.fProject * 1.24, r: hub.x + hubW / 2 + 6, b: hub.y - lift - 4 };
        const below: Rect = { l: above.l, t: hub.y + lift + 4, r: above.r, b: hub.y + lift + 12 + S.fProject * 1.24 };
        const blocked = (rect: Rect) => {
          if (clusters.some((c) => overlaps(grow(c.nameBlock, 4), rect))) return true;
          for (const m of placed.marks.values()) if (m.id !== hub.id && circleIntoRect(m, m.r + 2, rect) > 0) return true;
          return false;
        };
        if (blocked(above) && blocked(below) && fault()) return n;
      }
      const lifted = pick ? placed.marks.get(pick) : undefined;
      if (lifted) {
        const ringK = S.wide ? S.K : 0.84;
        const r = Math.max(lifted.r, 11 * ringK) + 11 * ringK + 5 + S.elemAlt + S.elemR * 2;
        if ((lifted.x - r < box.l || lifted.x + r > box.r || lifted.y - r < box.t || lifted.y + r > box.b) && fault()) return n;
        for (const c of clusters) if (circleIntoRect(lifted, r + 2, c.nameBlock) > 0 && fault()) return n;
        if (circleIntoRect(lifted, r + 2, captionBox) > 0 && fault()) return n;
      }
      for (const m of placed.marks.values()) {
        const r = m.kind === 'project' ? m.r * 1.35 : m.r;
        if ((m.x - r < box.l || m.x + r > box.r || m.y - r < box.t || m.y + r > box.b) && fault()) return n;
        if ((circleIntoRect(m, r + 2, captionBox) > 0 || circleIntoRect(m, r + 2, titleBox) > 0) && fault()) return n;
        for (const c of clusters) if (c.id !== m.id && circleIntoRect(m, r + 2, c.nameBlock) > 0 && fault()) return n;
      }
      /* Two clusters may share their outer air, not their marks. */
      if (S.wide) {
        for (let i = 0; i < clusters.length; i += 1)
          for (let j = i + 1; j < clusters.length; j += 1) {
            const c = clusters[i]!;
            const o = clusters[j]!;
            if (dist(c, o) < c.footprint + o.footprint && crowded(placed, c, o) && fault()) return n;
          }
      }
      return n;
    };

    const stageUse = (candidate: ReturnType<typeof place>) => {
      let l = Infinity;
      let r = -Infinity;
      let t = Infinity;
      let b = -Infinity;
      for (const m of candidate.marks.values()) {
        const rr = m.kind === 'project' ? m.r * 1.35 : m.r;
        l = Math.min(l, m.x - rr);
        r = Math.max(r, m.x + rr);
        t = Math.min(t, m.y - rr);
        b = Math.max(b, m.y + rr);
      }
      /* An adapted ellipse keeps a hair of margin over the spec's shares, which the spec's own ellipse meets with room. */
      const m = adapt ? 0.01 : 0;
      return S.wide ? Math.min((r - l) / w / (0.7 + m), (b - t) / h / (0.6 + m)) : (b - t) / Math.max(1, captionBox.t - titleBox.b) / (0.6 + m);
    };
    let placed: ReturnType<typeof place> | null = null;
    let placedUse = -Infinity;
    let placedBroken = Infinity;
    const room = Math.max(0, w - S.safe - (base.cx + base.rx + maxReach));
    for (let cut = 0; cut <= 30; cut += grain) {
      const yBottom = base.yBottom - cut * 12;
      if (yBottom <= base.yTop) break;
      for (let step = S.wide ? (adapt ? -10 : 0) : -15; step <= 15; step += grain) {
        const rx = base.rx * (1 - step * 0.02);
        /* A phone's map stays centred; a wide one may shift right, away from the caption. */
        const slack = S.wide ? room + base.rx - rx : 0;
        /* Shifted as far right as the stage allows first: that is what clears the caption. */
        for (let k = S.wide ? 12 : 0; k >= 0; k -= grain) {
          const x = base.cx + (slack * k) / 12;
          /* A candidate that already breaks more rules than the best so far cannot win: wide takes none that break any. */
          const limit = S.wide ? 1 : placedBroken + 1;
          let broken = blockFaults(centres(x, base.yTop, yBottom, rx), limit);
          if (broken >= limit) continue;
          const candidate = place(x, base.yTop, yBottom, rx);
          broken += faults(candidate, limit - broken);
          if (broken >= limit) continue;
          /* Fewest broken rules, then the stage used, then a clear corridor for every rest arc; ties keep the spec's order. */
          const used = stageUse(candidate);
          const open = -broken * 10000 + (used >= 1 ? 4000 : used * 1000) - cut * 0.01 - Math.abs(step) * 0.001;
          if (open + 2000 <= placedUse) {
            if (S.wide) break;
            continue;
          }
          const clear = flows.every((f) => corridor(candidate, f.from, f.to)) ? 2000 : 0;
          const value = open + clear;
          if (value > placedUse) {
            placed = candidate;
            placedUse = value;
            placedBroken = broken;
          }
          if (S.wide) break;
        }
        /* The first clear ellipse that fills the stage cannot be beaten: every later one gives up more. */
        if (placedUse >= 5999) break;
      }
      if (placedUse >= 5999) break;
    }
    placed ??= place(base.cx, base.yTop, Math.max(base.yTop, base.yBottom), base.rx);
    return { locals, placed, value: placedUse, S };
  };
  /* On a full stage the spec's ellipse stands once it breaks nothing and fills the stage; elsewhere it also needs a clear way for every rest arc. */
  const enough = (a: Attempt) => (!a.adapt && w >= REST_NAMES_PX ? 3999 : 5999);
  let chosen: Placement | null = null;
  let chosenAttempt: Attempt | null = null;
  for (const attempt of attempts) {
    const found = tryAttempt(attempt, attempt.adapt && S.wide ? 4 : 1);
    if (!chosen || found.value > chosen.value) {
      chosen = found;
      chosenAttempt = attempt;
    }
    if (found.value >= enough(attempt)) break;
  }
  if (chosenAttempt?.adapt && chosen!.S.wide) {
    const fine = tryAttempt(chosenAttempt, 1);
    if (fine.value >= chosen!.value) chosen = fine;
  }
  const { locals, placed } = chosen!;
  S = chosen!.S;
  const { marks, clusters } = placed;
  const clusterOf = new Map(clusters.map((c) => [c.id, c]));

  const stems: FilmMapLayout['stems'] = [];
  for (const id of order) {
    if (vault.project) stems.push({ from: vault.project.id, to: id, alpha: 0.16 });
    for (const it of locals.get(id)!.items) stems.push({ from: id, to: it.id, alpha: 0.24 });
  }

  const blockLabels: FilmLabel[] = [];
  for (const c of clusters) {
    for (const row of locals.get(c.id)!.rows) {
      blockLabels.push(
        makeLabel(measure, `${row.key}:${c.id}`, c.id, row.role, [{ text: row.text, ink: row.role === 'domain' ? 'strong' : 'tertiary' }], row.font, row.size, c.x, c.y + row.dy, 'center'),
      );
    }
  }
  let projectLabel: FilmLabel | null = null;
  let projectAt: ((dy: number) => FilmLabel) | null = null;
  let projectLift = 0;
  const project = vault.project ? marks.get(vault.project.id)! : null;
  if (project) {
    const font = fontOf(510, S.fProject, sans);
    const at = (dy: number) =>
      makeLabel(measure, `project:${project.id}`, project.id, 'project', [{ text: vault.project!.label, ink: 'name' }], font, S.fProject, project.x, project.y + dy, 'center');
    const lift = project.r * 1.35 + 8 + S.fProject * 0.6;
    projectAt = at;
    projectLift = lift;
    const taken = (label: FilmLabel) => {
      const box = grow(label.box, LABEL_PAD);
      return clusters.some((c) => overlaps(box, c.nameBlock)) || [...marks.values()].some((m) => m.id !== project.id && circleIntoRect(m, m.r, box) > 0);
    };
    projectLabel = at(-lift);
    if (taken(projectLabel) && !taken(at(lift))) projectLabel = at(lift);
  }

  const baseField = (lit: boolean) => {
    const field = new Field(bounds, [titleBox, captionBox]);
    for (const m of marks.values()) {
      const r = m.kind === 'project' ? m.r * 1.35 + 1.5 : m.r;
      if (lit && m.id === pick) continue;
      field.marks.push({ x: m.x, y: m.y, r });
    }
    for (const c of clusters) field.boxes.push(c.nameBlock);
    if (projectLabel) field.take(projectLabel.box);
    return field;
  };

  const spotsAround = (m: Pt & { r: number }, width: number, size: number, outward: number, extra: number[]) => {
    const out: { x: number; y: number; align: FilmLabel['align'] }[] = [];
    const right = Math.cos(outward) >= 0;
    const side = (toRight: boolean, gap: number, dy: number) => ({ x: toRight ? m.x + gap : m.x - gap, y: m.y + dy, align: toRight ? ('left' as const) : ('right' as const) });
    for (const reach of [m.r + NAME_GAP, ...extra.map((e) => m.r + NAME_GAP + e)]) {
      out.push(side(right, reach, 0));
      out.push({ x: m.x, y: m.y - reach - size * 0.5, align: 'center' });
      out.push({ x: m.x, y: m.y + reach + size * 0.5, align: 'center' });
      for (const sign of [-1, 1]) out.push(side(right, reach * Math.cos(40 * DEG), sign * (reach * Math.sin(40 * DEG) + size * 0.4)));
      out.push(side(!right, reach, 0));
      for (const sign of [-1, 1]) out.push(side(!right, reach * Math.cos(40 * DEG), sign * (reach * Math.sin(40 * DEG) + size * 0.4)));
    }
    void width;
    return out;
  };

  const ringSpots = (m: Pt & { r: number }, size: number, toward: number, extra: number[]) => {
    const out: { x: number; y: number; align: FilmLabel['align']; rank: number }[] = [];
    extra.forEach((e, ring) => {
      const reach = m.r + NAME_GAP + e;
      for (let k = 0; k < 16; k += 1) {
        const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const align: FilmLabel['align'] = c > 0.38 ? 'left' : c < -0.38 ? 'right' : 'center';
        const y = m.y + sn * reach + (align === 'center' ? Math.sign(sn) * size * 0.55 : sn * size * 0.3);
        out.push({ x: m.x + c * reach, y, align, rank: ring * 2 + angleGap(a, toward) });
      }
    });
    return out.sort((p, q) => p.rank - q.rank);
  };

  const tryPlace = (
    field: Field,
    key: string,
    id: string,
    role: LabelRole,
    segments: LabelSegment[],
    font: string,
    size: number,
    spots: { x: number; y: number; align: FilmLabel['align'] }[],
  ): FilmLabel | null => {
    for (const spot of spots) {
      const label = makeLabel(measure, key, id, role, segments, font, size, spot.x, spot.y, spot.align);
      if (field.free(label.box)) {
        field.take(label.box);
        return label;
      }
    }
    return null;
  };

  const outwardOf = (id: string) => {
    const m = marks.get(id)!;
    const home = m.domain ? marks.get(m.domain)! : project ?? m;
    return Math.atan2(m.y - home.y, m.x - home.x);
  };

  const ringK = S.wide ? S.K : 0.84;
  let lit: FilmLit | null = null;
  let pickBlock: Rect | null = null;
  const pickMark = pick ? marks.get(pick)! : null;
  const reach = pick ? reachOf(vault, pick) : null;
  let selectedR = 0;
  let agentR = 0;
  let ownDots = new Map<string, Pt>();
  let pickClear = 0;
  let pickLabels: FilmLabel[] = [];
  let pickSpots: { box: Rect; labels: FilmLabel[] }[] = [];
  if (pick && pickMark && reach) {
    selectedR = Math.max(pickMark.r, tokens.selectedDiscPx * ringK);
    agentR = Math.max(pickMark.r, 11 * ringK) + 11 * ringK;
    const own = vault.byId.get(pick)!.elements;
    const away = outwardOf(pick);
    const offsets = dotOffsets(own.length, away, 0, S, agentR + 5);
    ownDots = new Map(own.map((e, k) => [e, { x: pickMark.x + offsets[k]!.x, y: pickMark.y + offsets[k]!.y }]));
    pickClear = agentR + 5 + S.elemAlt + S.elemR + 2;
    if (S.wide) {
      const nameFont = fontOf(650, S.fPick, sans);
      const reachFont = fontOf(400, S.fReach, sans);
      const reachSegs = copy.reach(reach.needs.length, reach.neededBy.length);
      const label = vault.byId.get(pick)!.label;
      const nameW = measure(label, nameFont);
      const reachW = reachSegs.reduce((sum, seg) => sum + measure(seg.text, reachFont), 0);
      const blockH = S.fPick * 1.24 + 4 + S.fReach * 1.24;
      const endAngles = [...reach.needs, ...reach.neededBy, ...reach.relates]
        .filter((e) => !own.includes(e))
        .map((e) => marks.get(e))
        .filter((m): m is FilmMark => Boolean(m))
        .map((m) => Math.atan2(m.y - pickMark.y, m.x - pickMark.x));
      const homeAway = norm(away);
      const gap = pickClear + 10;
      const candidates: { a: number; align: FilmLabel['align'] }[] = [];
      const sideAway = Math.cos(homeAway) >= 0 ? 0 : Math.PI;
      candidates.push({ a: sideAway, align: sideAway === 0 ? 'left' : 'right' });
      candidates.push({ a: -Math.PI / 2, align: 'center' });
      for (const a of [-120, -60, -150, -30, 120, 60, 150, 30]) candidates.push({ a: a * DEG, align: Math.cos(a * DEG) > 0.2 ? 'left' : Math.cos(a * DEG) < -0.2 ? 'right' : 'center' });
      candidates.push({ a: Math.PI - sideAway, align: sideAway === 0 ? 'right' : 'left' });
      candidates.push({ a: Math.PI / 2, align: 'center' });
      const field = baseField(true);
      field.marks.push({ x: pickMark.x, y: pickMark.y, r: pickClear });
      /* Beside the pick first; farther out only as a place to move to when lit lines need the near ones. */
      const scored = [0, 24, 48]
        .flatMap((out) => candidates.map((c) => ({ ...c, out })))
        .map((c, k) => {
          const ax = pickMark.x + Math.cos(c.a) * (gap + c.out);
          const ay = pickMark.y + Math.sin(c.a) * (gap + c.out);
          const width = Math.max(nameW, reachW);
          const l = c.align === 'left' ? ax : c.align === 'right' ? ax - width : ax - width / 2;
          const top = Math.sin(c.a) < -0.3 ? ay - blockH : Math.sin(c.a) > 0.3 ? ay : ay - blockH / 2;
          const box: Rect = { l, t: top, r: l + width, b: top + blockH };
          const lineHit = endAngles.some((e) => angleGap(e, c.a) < 28 * DEG) ? 1 : 0;
          return { c, k, box, ax, top, lineHit };
        })
        .filter((row) => field.free(row.box))
        .sort((a, b) => a.c.out - b.c.out || a.lineHit - b.lineHit || a.k - b.k);
      pickSpots = scored.map((row) => {
        const nameY = row.top + (S.fPick * 1.24) / 2;
        const reachY = row.top + S.fPick * 1.24 + 4 + (S.fReach * 1.24) / 2;
        const ax = row.c.align === 'left' ? row.box.l : row.c.align === 'right' ? row.box.r : (row.box.l + row.box.r) / 2;
        return {
          box: row.box,
          labels: [
            makeLabel(measure, `pick:${pick}`, pick, 'pick', [{ text: label, ink: 'strong' }], nameFont, S.fPick, ax, nameY, row.c.align),
            makeLabel(measure, `reach:${pick}`, pick, 'reach', reachSegs, reachFont, S.fReach, ax, reachY, row.c.align),
          ],
        };
      });
      if (pickSpots[0]) {
        pickBlock = pickSpots[0].box;
        pickLabels = pickSpots[0].labels;
      }
    }
  }

  const restField = baseField(false);
  const restArcs: FilmArc[] = [];
  const sideOf = new Map<string, number>();
  let crossedSoFar = 0;
  const pickZone = pickMark ? { x: pickMark.x, y: pickMark.y, r: pickClear + 8 } : null;
  for (const f of flows) {
    const A = clusterOf.get(f.from);
    const B = clusterOf.get(f.to);
    if (!A || !B) continue;
    const width = Math.min(tokens.lineTaperMaxPx, tokens.lineTaperPx + tokens.lineTaperGainPx * (f.count - 1)) * (S.wide ? 1 : 0.7);
    const reverse = sideOf.get(`${f.to}\n${f.from}`);
    let best: { pts: Pt[]; numeral: Pt | null; cost: number; side: number } | null = null;
    for (const mag of arcBows) {
      for (const sign of [1, -1]) {
        const bow = mag * sign;
        /* Side in the pair's own frame: a reverse direction flips the chord, so it flips the bow. */
        const side = f.from < f.to ? sign : -sign;
        if (reverse !== undefined && side === reverse) continue;
        const chord = dist(A, B);
        const cut = (c: FilmCluster) => Math.min(c.footprint * (S.wide ? 0.9 : 1), chord * 0.38);
        let pts = trim(bowedPoints(A, B, bow, 48), A, cut(A), B, cut(B));
        const hitsMark = (p: Pt) => restField.marks.some((m) => dist(p, m) < m.r + 5) || restField.boxes.some((b) => inside(p, b));
        while (pts.length && hitsMark(pts[0]!)) pts = pts.slice(1);
        while (pts.length && hitsMark(pts[pts.length - 1]!)) pts = pts.slice(0, -1);
        if (pts.length < 4 || polylineLength(pts) < 40) continue;
        let cost = Math.abs(bow) * 30;
        for (const p of pts) {
          for (const c of clusters) {
            if (c.id === f.from || c.id === f.to) continue;
            const into = c.footprint + 2 - dist(p, c);
            if (into > 0) cost += 2000 + into;
          }
          if (project) cost += Math.max(0, project.r * 1.35 + 30 - dist(p, project));
          if (projectLabel && inside(p, grow(projectLabel.box, 4))) cost += 2000;
          else if (projectLabel && inside(p, grow(projectLabel.box, 10))) cost += 200;
          if (pickZone) cost += Math.max(0, pickZone.r - dist(p, pickZone)) * 4;
          if (pickBlock && inside(p, grow(pickBlock, 8))) cost += 400;
          if (hitsMark(p)) cost += 2000;
          if (!inside(p, bounds) || inside(p, captionBox) || inside(p, titleBox)) cost += 2000;
          if (restArcs.some((o) => o.numeral && dist(p, o.numeral) < S.numeralR + 4)) cost += 2000;
        }
        /* One crossing in the whole map is allowed; any more is as bad as a mark hit twice. */
        const crossed = restArcs.reduce((sum, other) => sum + crossings(pts, other.pts), 0);
        if (crossed > 0) cost += crossedSoFar + crossed <= 1 ? 300 : crossed * CROSSING_COST;
        const numeralFree = (q: Pt) =>
          restField.free({ l: q.x - S.numeralR, t: q.y - S.numeralR, r: q.x + S.numeralR, b: q.y + S.numeralR }) &&
          !restArcs.some((o) => (o.numeral && dist(o.numeral, q) < S.numeralR * 2 + 2 * LABEL_PAD + 4) || o.pts.some((p) => dist(p, q) < S.numeralR + 4));
        const numeral = NUMERAL_SPOTS.map((u) => pointAlong(pts, u)).find(numeralFree) ?? null;
        if (!numeral) cost += 1500;
        if (!best || cost < best.cost - 1e-6) best = { pts, numeral, cost, side };
      }
    }
    if (!best) {
      /* Every crossing count is drawn: with no clean route it takes the first bow, trimmed only at its clusters. */
      const sign = reverse === undefined ? 1 : f.from < f.to ? -reverse : reverse;
      const chord = dist(A, B);
      const pts = trim(bowedPoints(A, B, arcBows[0]! * sign, 48), A, Math.min(A.footprint, chord * 0.3), B, Math.min(B.footprint, chord * 0.3));
      best = { pts, numeral: null, cost: Infinity, side: f.from < f.to ? sign : -sign };
    }
    crossedSoFar += restArcs.reduce((sum, other) => sum + crossings(best!.pts, other.pts), 0);
    sideOf.set(`${f.from}\n${f.to}`, best.side);
    restArcs.push({ from: f.from, to: f.to, count: f.count, pts: best.pts, width, numeral: best.numeral });
    if (best.numeral)
      restField.take({ l: best.numeral.x - S.numeralR, t: best.numeral.y - S.numeralR, r: best.numeral.x + S.numeralR, b: best.numeral.y + S.numeralR });
  }
  for (const arc of restArcs) {
    const q = arc.numeral;
    if (q && restArcs.some((o) => o !== arc && o.pts.some((p) => dist(p, q) < S.numeralR + 2))) arc.numeral = null;
  }
  /* A rest arc that must pass where the project's name stands sends the name to the mark's other side, if that side is clear. */
  if (projectLabel && projectAt && project) {
    const crossed = (label: FilmLabel) => restArcs.some((arc) => arc.pts.some((p) => inside(p, grow(label.box, LABEL_PAD))));
    if (crossed(projectLabel)) {
      const other = projectAt(projectLabel.y < project.y ? projectLift : -projectLift);
      const check = new Field(bounds, [titleBox, captionBox]);
      for (const m of marks.values()) if (m.id !== project.id) check.marks.push({ x: m.x, y: m.y, r: m.r });
      for (const c of clusters) check.boxes.push(c.nameBlock);
      for (const arc of restArcs)
        if (arc.numeral)
          check.take({ l: arc.numeral.x - S.numeralR, t: arc.numeral.y - S.numeralR, r: arc.numeral.x + S.numeralR, b: arc.numeral.y + S.numeralR });
      if (!crossed(other) && check.free(other.box)) {
        restField.boxes[clusters.length] = grow(other.box, LABEL_PAD);
        projectLabel = other;
      }
    }
  }
  restField.samples = restArcs.flatMap((arc) => resample(arc.pts, 8));

  const restLabels: FilmLabel[] = [...blockLabels];
  if (projectLabel) restLabels.push(projectLabel);
  /* Capability names at rest only where the stage has room for them; a smaller one keeps the domains and the project. */
  if (S.wide && w >= REST_NAMES_PX) {
    const capFont = fontOf(510, S.fCap, sans);
    /* Rest names fade while the pick's block fades in, so they never share its place. */
    if (pickBlock) restField.boxes.push(pickBlock);
    const named = (id: string, ink: InkRole) => {
      const m = marks.get(id)!;
      const c = vault.byId.get(id)!;
      const extra = c.elements.length ? [S.elemGap + S.elemAlt + S.elemR * 2] : [10];
      return tryPlace(restField, `cap:${id}`, id, 'cap', [{ text: c.label, ink }], capFont, S.fCap, spotsAround(m, 0, S.fCap, outwardOf(id), extra));
    };
    if (pick) {
      const label = named(pick, 'name');
      if (label) restLabels.push(label);
    }
    const perCluster = w >= 1600 ? 5 : 3;
    for (const id of order) {
      let shown = 0;
      const caps = locals
        .get(id)!
        .items.filter((it) => it.id !== pick)
        .sort((a, b) => b.elements.length - a.elements.length || (a.id < b.id ? -1 : 1));
      for (const it of caps) {
        if (shown >= perCluster) break;
        const label = named(it.id, 'name');
        if (label) {
          restLabels.push(label);
          shown += 1;
        }
      }
    }
  }

  if (pick && pickMark && reach) {
    const own = new Set(vault.byId.get(pick)!.elements);
    const blocks = clusters.map((c) => c.nameBlock);
    const endsFar = [
      ...reach.needs.filter((e) => !own.has(e)).map((e) => ({ end: e, kind: 'needs' as const })),
      ...reach.neededBy.map((e) => ({ end: e, kind: 'neededBy' as const })),
      ...reach.relates.map((e) => ({ end: e, kind: 'relates' as const })),
    ].filter((row) => marks.has(row.end) && row.end !== pick);
    const endSet = new Set(endsFar.map((row) => row.end));
    /* A lit end left without a free name spot bans the bow of the line passing nearest it, and routes again. */
    const banned = new Map<string, number[]>();
    let attempt: { lines: FilmLitLine[]; litLabels: FilmLabel[]; keys: FilmLit['keys']; leader: FilmLit['leader']; owners: string[]; pointer: Pt; pointerBox: Rect; unnamed: number } | null = null;
    for (let round = 0; round < 8; round += 1) {
      const lines: FilmLitLine[] = [];
      const bowOf = new Map<string, number>();
      const litBows = [0.16, -0.16, 0.24, -0.24, 0.32, -0.32];
      const wider = S.wide ? [0.42, -0.42, 0.52, -0.52, 0.64, -0.64, 0.08, -0.08, 0.8, -0.8] : [0.42, -0.42, 0.52, -0.52, 0.64, -0.64, 0.08, -0.08];
      const usedBows = new Map<string, number[]>();
      for (const row of endsFar) {
        const E = marks.get(row.end)!;
        const endDomain = E.domain ?? '';
        let best: { pts: Pt[]; cost: number; bow: number } | null = null;
        /* Every relation is drawn: when its distinct bows are spent, it takes the cheapest one again. */
        for (const [pool, anyBow] of [[litBows, false], [wider, false], [[...litBows, ...wider], true]] as const) {
          if (anyBow && best) break;
          for (const bow of pool) {
            if (!anyBow && (usedBows.get(endDomain) ?? []).includes(bow)) continue;
            if (!anyBow && banned.get(row.end)?.includes(bow)) continue;
            const pts = trim(bowedPoints(pickMark, E, bow, 48), pickMark, agentR + 2, E, E.r + 5);
            if (pts.length < 3) continue;
            let cost = Math.abs(bow) * 20;
            for (const p of pts) {
              if (blocks.some((b) => inside(p, grow(b, 3)))) cost += 2000;
              if (inside(p, captionBox) || inside(p, titleBox) || !inside(p, bounds)) cost += 2000;
              if (pickBlock && inside(p, grow(pickBlock, 12))) cost += 2000;
              if (projectLabel && inside(p, grow(projectLabel.box, LABEL_PAD))) cost += 300;
              for (const other of endSet) {
                if (other === row.end) continue;
                const o = marks.get(other)!;
                const d = dist(p, o);
                cost += Math.max(0, o.r + 8 - d) * 40 + Math.max(0, o.r + 30 - d) * 6;
              }
              for (const dot of ownDots.values()) cost += Math.max(0, S.elemR + 3 - dist(p, dot)) * 40;
            }
            for (const line of lines) {
              const otherDomain = marks.get(line.end)?.domain;
              if (otherDomain !== endDomain) continue;
              for (const p of pts) {
                if (dist(p, pickMark) < agentR + 24) continue;
                if (line.pts.some((q) => dist(p, q) < 4)) cost += 60;
              }
            }
            if (!best || cost < best.cost - 1e-6) best = { pts, cost, bow };
          }
          if (best && best.cost < 300) break;
        }
        if (!best) {
          /* Every relation is drawn: an end too close for a bow gets a straight line from the ring. */
          const a = Math.atan2(E.y - pickMark.y, E.x - pickMark.x);
          best = {
            pts: [
              { x: pickMark.x + Math.cos(a) * (agentR + 2), y: pickMark.y + Math.sin(a) * (agentR + 2) },
              { x: E.x - Math.cos(a) * (E.r + 3), y: E.y - Math.sin(a) * (E.r + 3) },
            ],
            cost: Infinity,
            bow: 0,
          };
        }
        usedBows.set(endDomain, [...(usedBows.get(endDomain) ?? []), best.bow]);
        bowOf.set(row.end, best.bow);
        lines.push({
          end: row.end,
          kind: row.kind,
          pts: best.pts,
          width: row.kind === 'relates' ? tokens.lineDotPx : tokens.lineTaperPx * (S.wide ? 1 : 0.76),
          towardPick: row.kind === 'neededBy',
        });
      }
      for (const e of reach.ownNeeds) {
        const dot = ownDots.get(e);
        if (!dot) continue;
        const a = Math.atan2(dot.y - pickMark.y, dot.x - pickMark.x);
        const from = { x: pickMark.x + Math.cos(a) * (selectedR + 1), y: pickMark.y + Math.sin(a) * (selectedR + 1) };
        const to = { x: dot.x - Math.cos(a) * (S.elemR + 1), y: dot.y - Math.sin(a) * (S.elemR + 1) };
        lines.push({ end: e, kind: 'own', pts: [from, to], width: 1.2, towardPick: false });
      }

      const owners = [...endSet]
        .map((e) => vault.byId.get(e)!)
        .filter((c) => c.kind === 'element' && c.capability)
        .map((c) => c.capability!)
        .filter((c, i, all) => all.indexOf(c) === i && c !== pick);

      const tipA = 30 * DEG;
      const pointer = { x: pickMark.x + Math.cos(tipA) * selectedR * 0.55, y: pickMark.y + Math.sin(tipA) * selectedR * 0.55 };
      const pointerBox: Rect = { l: pointer.x - 1, t: pointer.y - 1, r: pointer.x + 15, b: pointer.y + 22 };

      let litLabels: FilmLabel[] = [];
      const field = baseField(true);
      /* Lit, the other domains' names and the project's are context: a lit line or the agent's leader never runs through one, it steps aside. */
      const pickHome = vault.byId.get(pick)!.domain;
      /* The pick's own domain is context too once a line must cross it: the pick's block or readout carries the content. */
      const dimmed = (label: FilmLabel) => label.role === 'project' || label.role === 'domain' || label.role === 'units';
      const hidden = new Set<string>();
      const dimRects = new Set<Rect>(field.boxes.filter((_, k) => k < clusters.length && clusters[k]!.id !== pickHome));
      if (projectLabel) dimRects.add(field.boxes[clusters.length]!);
      field.marks.push({ x: pickMark.x, y: pickMark.y, r: pickClear });
      for (const dot of ownDots.values()) field.marks.push({ x: dot.x, y: dot.y, r: S.elemR });
      field.boxes.push(grow(pointerBox, 0));
      field.samples = lines.flatMap((line) => resample(line.pts, 8));
      const keys: FilmLit['keys'] = [];
      let leader: FilmLit['leader'] = null;
      const sunkPhone = (label: FilmLabel) => !S.wide && label.role === 'units' && label.id !== vault.byId.get(pick)!.domain;
      litLabels.push(...blockLabels.filter((label) => !sunkPhone(label)));
      if (projectLabel) litLabels.push(projectLabel);
      if (S.wide) {
        /* The pick's block keeps 12 px from every lit line: lines that pass where it was put move it to the next free place. */
        const near = (box: Rect) => field.samples.some((p) => inside(p, grow(box, 12)));
        if (pickBlock && near(pickBlock)) {
          const moved = pickSpots.find((spot) => !near(spot.box));
          if (moved) {
            pickBlock = moved.box;
            pickLabels = moved.labels;
          }
        }
        if (pickBlock) {
          litLabels.push(...pickLabels);
          field.boxes.push(grow(pickBlock, 12 - LABEL_PAD));
        }
        const tagSans = fontOf(510, S.fTag, sans);
        const tagMono = fontOf(400, S.fTag, mono);
        const tagW = Math.max(measure(copy.agent, tagSans), measure(copy.tool, tagMono));
        const rowH = S.fTag * 1.24;
        const tagH = rowH * 2 + 3;
        const tagField = field;
        done: for (const lead of [44, 70]) {
          for (const deg of [-42, -138, -20, -160, 42, 138, 0, 180, -90, 90, -65, -115]) {
            const a = deg * DEG;
            const q = { x: pickMark.x + Math.cos(a) * (agentR + lead), y: pickMark.y + Math.sin(a) * (agentR + lead) };
            const toRight = Math.cos(a) >= -0.01;
            const up = Math.sin(a) < -0.01;
            const l = toRight ? q.x + 6 : q.x - 6 - tagW;
            const t = up ? q.y - tagH : Math.abs(Math.sin(a)) < 0.02 ? q.y - tagH / 2 : q.y;
            const box: Rect = { l, t, r: l + tagW, b: t + tagH };
            const from = { x: pickMark.x + Math.cos(a) * (agentR + 1), y: pickMark.y + Math.sin(a) * (agentR + 1) };
            const leaderPts = resample([from, q], 6);
            if (!tagField.free(box)) continue;
            if (pickBlock && overlaps(box, grow(pickBlock, 12))) continue;
            if (leaderPts.some((p) => tagField.boxes.some((b) => inside(p, b)))) continue;
            const x = toRight ? l : l + tagW;
            const align = toRight ? ('left' as const) : ('right' as const);
            litLabels.push(makeLabel(measure, 'agent', null, 'agent', [{ text: copy.agent, ink: 'agent' }], tagSans, S.fTag, x, t + rowH / 2, align));
            litLabels.push(makeLabel(measure, 'tool', null, 'tool', [{ text: copy.tool, ink: 'secondary' }], tagMono, S.fTag, x, t + rowH + 3 + rowH / 2, align));
            tagField.take(box);
            leader = { from, to: q };
            break done;
          }
        }
        const endFont = fontOf(510, S.fCap, sans);
        const byWeight = [...endsFar].sort((p, q) => Number(marks.get(q.end)!.kind === 'element') - Number(marks.get(p.end)!.kind === 'element'));
        for (const row of byWeight) {
          const m = marks.get(row.end)!;
          const line = lines.find((l) => l.end === row.end);
          const arrive = line ? Math.atan2(m.y - line.pts[line.pts.length - 1]!.y, m.x - line.pts[line.pts.length - 1]!.x) : outwardOf(row.end);
          const spots = ringSpots(m, S.fCap, arrive, m.kind === 'element' ? [0, 6, 12, 18] : [0, 8, 18, 30, 44, 60]);
          const segments = [{ text: vault.byId.get(row.end)!.label, ink: 'strong' as const }];
          let label = tryPlace(field, `end:${row.end}`, row.end, 'end', segments, endFont, S.fCap, spots);
          /* No free spot: the name may stand where only dimmed context names are, which then step aside. */
          if (!label) {
            const kept = [...field.boxes];
            field.boxes.splice(0, field.boxes.length, ...kept.filter((b) => !dimRects.has(b)));
            label = tryPlace(field, `end:${row.end}`, row.end, 'end', segments, endFont, S.fCap, spots);
            const taken = label ? field.boxes.pop()! : null;
            field.boxes.splice(0, field.boxes.length, ...kept);
            if (label && taken) {
              field.boxes.push(taken);
              for (const dim of litLabels) if (dimmed(dim) && overlaps(grow(dim.box, LABEL_PAD), taken)) hidden.add(dim.key);
            }
          }
          if (label) litLabels.push(label);
        }
      } else {
        const x0 = input.caption.l;
        const y2 = captionBox.t - 14;
        const y1 = y2 - 28;
        keys.push({ x: x0 + 6, y: y1, ink: 'project' }, { x: x0 + 6, y: y2, ink: 'agent' });
        const nameFont = fontOf(650, S.fPick, sans);
        const reachFont = fontOf(400, S.fReach, sans);
        const name = makeLabel(measure, `pick:${pick}`, pick, 'pick', [{ text: vault.byId.get(pick)!.label, ink: 'strong' }], nameFont, S.fPick, x0 + 20, y1, 'left');
        const reachLabel = makeLabel(measure, `reach:${pick}`, pick, 'reach', copy.reach(reach.needs.length, reach.neededBy.length), reachFont, S.fReach, name.box.r + 10, y1, 'left');
        const agentFont = fontOf(510, S.fTag, sans);
        const agent = makeLabel(measure, 'agent', null, 'agent', [{ text: copy.agent, ink: 'agent' }], agentFont, S.fTag, x0 + 20, y2, 'left');
        const tool = makeLabel(measure, 'tool', null, 'tool', [{ text: copy.tool, ink: 'secondary' }], fontOf(400, S.fTag, mono), S.fTag, agent.box.r + 10, y2, 'left');
        litLabels.push(name, reachLabel, agent, tool);
      }
      const paths = [...lines.flatMap((line) => resample(line.pts, 3)), ...(leader ? resample([leader.from, leader.to], 3) : [])];
      const blockOf = new Map(clusters.map((c) => [c.id, c.nameBlock]));
      for (const label of litLabels) {
        if (!dimmed(label)) continue;
        const area = label.role === 'project' ? grow(label.box, 3) : blockOf.get(label.id ?? '')!;
        if (paths.some((p) => inside(p, area))) hidden.add(label.key);
      }
      for (const label of litLabels) {
        if (label.role !== 'domain' && label.role !== 'units') continue;
        if (litLabels.some((o) => o.id === label.id && o.role !== label.role && (o.role === 'domain' || o.role === 'units') && hidden.has(o.key)))
          hidden.add(label.key);
      }
      litLabels = litLabels.filter((label) => !hidden.has(label.key));
      const named = new Set(litLabels.filter((l) => l.role === 'end').map((l) => l.id));
      const unnamed = S.wide ? endsFar.filter((row) => !named.has(row.end)) : [];
      if (!attempt || unnamed.length < attempt.unnamed) attempt = { lines, litLabels, keys, leader, owners, pointer, pointerBox, unnamed: unnamed.length };
      if (unnamed.length === 0) break;
      /* The spot that only lines block, by the fewest of them: those lines take another bow next round. */
      const lostEnd = unnamed[0]!.end;
      const lost = marks.get(lostEnd)!;
      const samples = field.samples;
      field.samples = [];
      let ban: FilmLitLine[] | null = null;
      for (const spot of ringSpots(lost, S.fCap, outwardOf(lostEnd), lost.kind === 'element' ? [0, 6, 12, 18] : [0, 8, 18, 30, 44, 60])) {
        const box = makeLabel(measure, 'probe', lostEnd, 'end', [{ text: vault.byId.get(lostEnd)!.label, ink: 'strong' }], fontOf(510, S.fCap, sans), S.fCap, spot.x, spot.y, spot.align).box;
        if (!field.free(box)) continue;
        const pad = grow(box, LABEL_PAD);
        const blockers = lines.filter((l) => resample(l.pts, 8).some((q) => inside(q, pad)));
        if (blockers.some((l) => !bowOf.has(l.end))) continue;
        if (!ban || blockers.length < ban.length) ban = blockers;
      }
      field.samples = samples;
      if (!ban || ban.length === 0) break;
      for (const l of ban) banned.set(l.end, [...(banned.get(l.end) ?? []), bowOf.get(l.end)!]);
    }
    const { lines, litLabels, keys, leader, owners, pointer, pointerBox } = attempt!;
    lit = {
      pick,
      reach,
      selectedR,
      rings: [selectedR + tokens.selectedRingGapPx * ringK, selectedR + 9 * ringK],
      agentR,
      ownDots,
      lines,
      ends: [...endSet, ...reach.ownNeeds],
      owners,
      labels: litLabels,
      leader,
      pointer,
      pointerBox,
      keys,
    };
  }

  return {
    sizes: S,
    w,
    h,
    titleBox,
    captionBox,
    order,
    marks,
    clusters,
    stems,
    restArcs,
    restLabels,
    lit,
    pick,
    capRadius,
  };
}
