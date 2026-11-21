import { DEG, circleIntoRect, normalizeAngle, type Pt, type Rect } from './film-geometry';
import { LABEL_PAD, fontOf, type Measure } from './film-map-labels';
import type { FilmSizes } from './film-map-sizes';
import type { FilmConcept, FilmVault } from './film-vault';

const FAN_STEP = 0.42;
export const GATE_HALF = 26 * DEG;
const HUB_HALF = 32 * DEG;
const PHONE_UNITS_MAX = 160;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** Half the angle a domain keeps clear toward the section title, above its disc. */
export function titleHalfAngle(sizes: FilmSizes, locale: string): number {
  return (sizes.wide ? (locale === 'en' ? 54 : 44) : 38) * DEG;
}

export interface ClusterItem {
  id: string;
  a: number;
  d: number;
  r: number;
  elements: string[];
  gate?: boolean;
}

export interface LocalCluster {
  id: string;
  items: ClusterItem[];
  /** Elements the domain holds without a capability, just above its disc. */
  direct: string[];
  footprint: number;
  nameBlock: Rect;
  rows: { text: string; font: string; size: number; dy: number; role: 'domain' | 'units'; key: string }[];
}

export interface LocalClusterInput {
  vault: FilmVault;
  pick: string | null;
  locale: string;
  measure: Measure;
  sans: string;
  copy: { units: (capabilities: number, elements: number) => string };
}

export function itemReach(item: ClusterItem, S: FilmSizes): number {
  return item.r + (item.elements.length ? S.elemGap + S.elemAlt + S.elemR * 2 : 0);
}

export function upReach(local: LocalCluster, S: FilmSizes): number {
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

export function layoutLocalCluster(
  input: LocalClusterInput,
  S: FilmSizes,
  domain: FilmConcept,
  capRadius: (e: number) => number,
  gate: number | null,
  hub: number | null = null,
): LocalCluster {
  const { vault, pick, measure, sans, locale } = input;
  const caps = vault.capabilities.filter((c) => c.domain === domain.id && !(gate !== null && c.id === pick));
  const n = caps.length;
  const titleHalf = titleHalfAngle(S, locale);
  const cuts: [number, number][] = [[Math.PI / 2 - titleHalf, Math.PI / 2 + titleHalf]];
  if (gate !== null) cuts.push([gate - GATE_HALF, gate + GATE_HALF]);
  /* On a phone the clusters stand close to the project: none of their marks faces it. */
  if (hub !== null && !S.wide) cuts.push([hub - HUB_HALF, hub + HUB_HALF]);
  const blocked = (a: number) => cuts.some(([l, r]) => normalizeAngle(a - l) < normalizeAngle(r - l));
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
  const items: ClusterItem[] = dealt.map((c, i) => ({
    id: c.id,
    a: angleAt((i + 0.5) / Math.max(1, n)) + (hash(`${c.id}#a`) - 0.5) * (total / Math.max(1, n)) * 0.3,
    d: S.rings[band.get(c.id)!]! * (1 + (hash(`${c.id}#r`) - 0.5) * 0.12),
    r: capRadius(c.elements.length),
    elements: c.elements,
  }));
  /* No mark may touch the name block: a capability that would moves along its ring to clear it. */
  const touches = (item: ClusterItem, a: number) => {
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
    const item: ClusterItem = { id: c.id, a: gate, d: S.rings[2] * (S.wide ? 1.42 : 1.3), r: capRadius(c.elements.length), elements: c.elements, gate: true };
    const away = Math.sin(gate - Math.PI / 2) >= 0 ? 1 : -1;
    for (let step = 0; step < 90 && touches(item, item.a); step += 1) item.a += away * DEG;
    items.push(item);
  }
  const footprint = Math.max(S.domainR + 8, ...items.filter((it) => !it.gate).map((it) => it.d + itemReach(it, S)));
  const direct = vault.elements.filter((e) => e.domain === domain.id && !e.capability).map((e) => e.id);
  return { id: domain.id, items, direct, footprint, nameBlock, rows };
}
