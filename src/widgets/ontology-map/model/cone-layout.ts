export type ConeKind = "project" | "domain" | "capability" | "element";

export const TAU = Math.PI * 2;

export const CONE_HEIGHT_SCALE = 0.8;

export const DOME_PLANE: Readonly<Record<ConeKind, { y: number; r: number }>> = {
  project: { y: 148 * CONE_HEIGHT_SCALE, r: 0 },
  domain: { y: 56 * CONE_HEIGHT_SCALE, r: 148 },
  capability: { y: -48 * CONE_HEIGHT_SCALE, r: 192 },
  element: { y: -150 * CONE_HEIGHT_SCALE, r: 224 },
};

export function domeHash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export interface ConeInputNode {
  id: string;
  kind: ConeKind;
  x: number;
  y: number;
  parentId: string | null;
}

export interface ConeCoord {
  px: number;
  py: number;
  pz: number;
}

export interface ConeCircle {
  kind: ConeKind;
  cx: number;
  cz: number;
  y: number;
  r: number;
  named?: boolean;
}

const CONE_SPACING: Readonly<Record<ConeKind, number>> = {
  project: 0,
  domain: 0,
  capability: 24,
  element: 15,
};
const CONE_MIN_R: Readonly<Record<ConeKind, number>> = { project: 0, domain: 0, capability: 10, element: 6 };
const CONE_MAX_R: Readonly<Record<ConeKind, number>> = { project: 0, domain: 0, capability: 96, element: 40 };
const CONE_ROOM_FILL = 0.82;
export const CONE_STAGGER_FROM = 8;
export const CONE_STAGGER_OUT = 1.12;
export const CONE_STAGGER_IN = 0.9;

export function layoutCone(nodes: readonly ConeInputNode[]): { coords: Map<string, ConeCoord>; circles: ConeCircle[] } {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = new Map<string, ConeCoord>();
  const circles: ConeCircle[] = [];
  const byIdAsc = (a: ConeInputNode, b: ConeInputNode) => (a.id < b.id ? -1 : 1);

  const kids = new Map<string, ConeInputNode[]>();
  for (const n of nodes) {
    if (n.parentId === null || !byId.has(n.parentId) || n.parentId === n.id) continue;
    const list = kids.get(n.parentId);
    if (list) list.push(n);
    else kids.set(n.parentId, [n]);
  }
  for (const list of kids.values()) list.sort(byIdAsc);

  const weightMemo = new Map<string, number>();
  const weightOf = (id: string, trail: Set<string>): number => {
    const memo = weightMemo.get(id);
    if (memo !== undefined) return memo;
    if (trail.has(id)) return 1;
    trail.add(id);
    let w = 1;
    for (const k of kids.get(id) ?? []) w += weightOf(k.id, trail);
    trail.delete(id);
    weightMemo.set(id, w);
    return w;
  };

  const projects = nodes.filter((n) => n.kind === "project").sort(byIdAsc);
  projects.forEach((p, i) => {
    if (projects.length === 1) {
      coords.set(p.id, { px: 0, py: DOME_PLANE.project.y, pz: 0 });
    } else {
      const a = (i / projects.length) * TAU - Math.PI / 2;
      coords.set(p.id, { px: Math.cos(a) * 26, py: DOME_PLANE.project.y, pz: Math.sin(a) * 26 });
    }
  });

  const domains = nodes.filter((n) => n.kind === "domain").sort(byIdAsc);
  const ringR = DOME_PLANE.domain.r;
  const weights = domains.map((d) => weightOf(d.id, new Set()));
  const weightSum = weights.reduce((acc, w) => acc + w, 0) || 1;
  const sectorOf = new Map<string, number>();
  const bearingOf = new Map<string, number>();
  let cursor = -Math.PI / 2;
  domains.forEach((d, i) => {
    const sector = (weights[i] / weightSum) * TAU;
    const a = cursor + sector / 2;
    cursor += sector;
    sectorOf.set(d.id, sector);
    bearingOf.set(d.id, a);
    coords.set(d.id, { px: Math.cos(a) * ringR, py: DOME_PLANE.domain.y, pz: Math.sin(a) * ringR });
  });
  if (domains.length > 0) circles.push({ kind: "domain", cx: 0, cz: 0, y: DOME_PLANE.domain.y, r: ringR });

  const rest = (parent: ConeCoord, outward: number, children: readonly ConeInputNode[], r: number): void => {
    const n = children.length;
    const ordered = [...children].sort((a, b) => {
      const dw = weightOf(b.id, new Set()) - weightOf(a.id, new Set());
      return dw !== 0 ? dw : byIdAsc(a, b);
    });
    ordered.forEach((k, i) => {
      const slot = i === 0 ? 0 : i % 2 ? (i + 1) / 2 : -(i / 2);
      const a = outward + (slot / n) * TAU;
      const ri = n > CONE_STAGGER_FROM ? r * (i % 2 ? CONE_STAGGER_OUT : CONE_STAGGER_IN) : r;
      coords.set(k.id, { px: parent.px + Math.cos(a) * ri, py: DOME_PLANE[k.kind].y, pz: parent.pz + Math.sin(a) * ri });
    });
  };
  const baseRadius = (count: number, tier: ConeKind, room: number): number => {
    if (count <= 1) return 0;
    const cap = Math.min(CONE_MAX_R[tier], room * CONE_ROOM_FILL);
    const wanted = Math.max(CONE_MIN_R[tier], (count * CONE_SPACING[tier]) / TAU);
    return Math.max(0, Math.min(cap, wanted));
  };

  const capRoom = new Map<string, number>();
  for (const d of domains) {
    const children = kids.get(d.id) ?? [];
    const room = ringR * Math.sin((sectorOf.get(d.id) ?? 0) / 2);
    const r = baseRadius(children.length, "capability", room);
    const at = coords.get(d.id)!;
    const outward = bearingOf.get(d.id) ?? 0;
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "capability", cx: at.px, cz: at.pz, y: DOME_PLANE.capability.y, r });
    const childRoom = children.length <= 1 ? room * CONE_ROOM_FILL : r * Math.sin(Math.PI / children.length);
    for (const c of children) capRoom.set(c.id, childRoom);
  }

  const capabilities = nodes.filter((n) => n.kind === "capability").sort(byIdAsc);
  for (const c of capabilities) {
    const at = coords.get(c.id);
    if (!at) continue;
    const children = kids.get(c.id) ?? [];
    if (children.length === 0) continue;
    const parentAt = c.parentId !== null ? coords.get(c.parentId) : undefined;
    const outward = parentAt ? Math.atan2(at.pz - parentAt.pz, at.px - parentAt.px) : Math.atan2(at.pz, at.px);
    const r = baseRadius(children.length, "element", capRoom.get(c.id) ?? CONE_MAX_R.element);
    rest(at, outward, children, r);
    if (r > 0) circles.push({ kind: "element", cx: at.px, cz: at.pz, y: DOME_PLANE.element.y, r });
  }

  for (const n of nodes) {
    if (coords.has(n.id)) continue;
    const a = domeHash01(n.id) * TAU;
    const r = DOME_PLANE[n.kind].r;
    coords.set(n.id, { px: Math.cos(a) * r, py: DOME_PLANE[n.kind].y, pz: Math.sin(a) * r });
  }
  return { coords, circles };
}
