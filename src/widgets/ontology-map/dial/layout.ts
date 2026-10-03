import { ringPlan } from "./rings";
import type { Box, DialCluster, DialItem, DialMemory, DialModel, DialRing, DialScene, DialTokens, Point } from "./types";

type LayoutTokens = Pick<
  DialTokens,
  "pitch" | "spiralC" | "spiralK0" | "elementRoom" | "elementHole" | "angularGap" | "ringGap" | "hubClearance" | "orphanPitch"
>;

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const FILL = 0.97;
const GROWTH = 1.04;
const RELAX_ROUNDS = 400;
const AXIS_SAMPLES = 72;
const AXIS_PREFERRED = (-3 * Math.PI) / 4;
const AXIS_BIAS = 8;
const PACKING = 0.9069;
const ROOM_FILL = 0.92;
const MAX_STEP = 5;

function spiralRadius(k: number, tokens: Pick<DialTokens, "pitch" | "spiralC" | "spiralK0">): number {
  return tokens.spiralC * tokens.pitch * Math.sqrt(k + tokens.spiralK0);
}

function footprintOf(items: number, tokens: Pick<DialTokens, "pitch" | "spiralC" | "spiralK0" | "elementRoom">): number {
  return spiralRadius(Math.max(0, items - 1), tokens) + tokens.elementRoom * tokens.pitch;
}

function wrap(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x <= -Math.PI) x += Math.PI * 2;
  return x;
}

function relaxRing(members: { id: string; angle: number; need: number }[]): void {
  if (members.length < 2) return;
  members.sort((a, b) => a.angle - b.angle || (a.id < b.id ? -1 : 1));
  for (let iter = 0; iter < RELAX_ROUNDS; iter += 1) {
    let moved = false;
    for (let i = 0; i < members.length; i += 1) {
      const a = members[i]!;
      const b = members[(i + 1) % members.length]!;
      const required = (a.need + b.need) / 2;
      let d = b.angle - a.angle;
      if (i === members.length - 1) d += Math.PI * 2;
      if (d < required - 1e-9) {
        const push = (required - d) / 2 + 1e-9;
        a.angle -= push;
        b.angle += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function ringBounds(step: number): { min: number; max: number | null } {
  return { min: step === 0 ? 0 : 2 ** step, max: step >= MAX_STEP ? null : 2 ** (step + 1) - 1 };
}

function itemOrderOf(domainId: string, entries: readonly string[], remembered: readonly string[] | undefined): string[] {
  const present = new Set(entries);
  const kept = (remembered ?? []).filter((id) => present.has(id));
  const seen = new Set(kept);
  for (const id of entries) if (!seen.has(id)) kept.push(id);
  return kept;
}

export function layoutDial(model: DialModel, order: readonly string[], tokens: LayoutTokens, memory: DialMemory | null): DialScene {
  const P = tokens.pitch;
  const gap = tokens.angularGap * P;
  const directId = (domainId: string) => `${domainId}::direct`;
  const itemsOf = (id: string) => model.domainById.get(id)!.capabilityIds.length + 1;
  const footprint = new Map(order.map((id) => [id, footprintOf(itemsOf(id), tokens)]));

  const weights = order.map((id) => 2 * footprint.get(id)! + gap);
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
  const target = new Map<string, number>();
  let cum = 0;
  order.forEach((id, i) => {
    target.set(id, -Math.PI / 2 + (Math.PI * 2 * (cum + weights[i]! / 2 - weights[0]! / 2)) / totalWeight);
    cum += weights[i]!;
  });

  const inOrder = new Set(order);
  const rings: DialRing[] = [];
  const placed = new Map<string, { step: number; angle: number; radius: number }>();
  let previousRadius = 0;
  let previousMax = 0;
  for (const plan of ringPlan(model)) {
    const ids = plan.domainIds.filter((id) => inOrder.has(id));
    if (ids.length === 0) continue;
    const maxF = Math.max(...ids.map((id) => footprint.get(id)!));
    let radius = rings.length === 0 ? tokens.hubClearance + maxF : previousRadius + previousMax + maxF + tokens.ringGap * P;
    const needOf = (id: string, r: number) => 2 * Math.asin(Math.min(1, (footprint.get(id)! + gap / 2) / r));
    while (ids.reduce((s, id) => s + needOf(id, radius), 0) > Math.PI * 2 * FILL) radius *= GROWTH;
    radius = Math.max(radius, memory?.radiusByStep.get(plan.step) ?? 0);
    const members = ids.map((id) => {
      const was = memory?.angleById.get(id);
      return { id, angle: was && was.step === plan.step ? was.angle : target.get(id)!, need: needOf(id, radius) };
    });
    relaxRing(members);
    for (const m of members) placed.set(m.id, { step: plan.step, angle: m.angle, radius });
    rings.push({ step: plan.step, ...ringBounds(plan.step), radius });
    previousRadius = radius;
    previousMax = maxF;
  }

  const positions = new Map<string, Point>();
  const clusters: DialCluster[] = [];
  const itemById = new Map<string, DialItem>();
  const itemOrder = new Map<string, string[]>();
  const elementPitches: number[] = [];
  const room = tokens.elementRoom * P;
  const hole = tokens.elementHole * P;
  for (const id of order) {
    const at = placed.get(id);
    if (!at) continue;
    const d = model.domainById.get(id)!;
    const chip = { x: Math.cos(at.angle) * at.radius, y: Math.sin(at.angle) * at.radius };
    positions.set(id, chip);
    const entries = [...d.capabilityIds].sort((a, b) => (a < b ? -1 : 1));
    if (d.directElementIds.length > 0) entries.push(directId(id));
    const sequence = itemOrderOf(id, entries, memory?.itemOrder.get(id));
    itemOrder.set(id, sequence);
    const items: DialItem[] = sequence.map((itemId, k) => {
      const direct = itemId === directId(id);
      const elementIds = direct ? d.directElementIds : model.capabilityById.get(itemId)!.elementIds;
      const r = spiralRadius(k, tokens);
      const phi = at.angle + k * GOLDEN;
      const x = chip.x + Math.cos(phi) * r;
      const y = chip.y + Math.sin(phi) * r;
      const m = elementIds.length;
      const elementPitch = m <= 1 ? room : room * Math.sqrt(Math.PI / (m * PACKING)) * ROOM_FILL;
      if (!direct) elementPitches.push(elementPitch);
      elementIds.forEach((el, j) => {
        const rr = m === 1 ? (room + hole) / 2 : Math.sqrt(hole * hole + (room * room - hole * hole) * ((j + 0.5) / m));
        const pj = phi + j * GOLDEN;
        positions.set(el, { x: x + Math.cos(pj) * rr, y: y + Math.sin(pj) * rr });
      });
      if (!direct) positions.set(itemId, { x, y });
      const item: DialItem = { id: itemId, direct, x, y, elementIds, elementPitch };
      itemById.set(itemId, item);
      return item;
    });
    clusters.push({ domainId: id, step: at.step, angle: at.angle, chip, footprint: footprint.get(id)!, items });
  }

  let outerRadius = 0;
  for (const c of clusters) outerRadius = Math.max(outerRadius, Math.hypot(c.chip.x, c.chip.y) + c.footprint);

  const orphanIds = model.orphanIds.filter((id) => !positions.has(id) && id !== model.projectId).sort();
  const orphanPitch = tokens.orphanPitch * P;
  const orphanTokens = { pitch: orphanPitch, spiralC: tokens.spiralC, spiralK0: tokens.spiralK0 };
  const orphanRadius = orphanIds.length > 0 ? spiralRadius(orphanIds.length, orphanTokens) : 0;
  const orphanCentre = { x: outerRadius * 0.82 + orphanRadius + 2 * P, y: outerRadius * 0.82 };
  orphanIds.forEach((id, k) => {
    const r = spiralRadius(k, orphanTokens);
    positions.set(id, { x: orphanCentre.x + Math.cos(k * GOLDEN) * r, y: orphanCentre.y + Math.sin(k * GOLDEN) * r });
  });
  if (model.projectId) positions.set(model.projectId, { x: 0, y: 0 });

  let axisAngle = AXIS_PREFERRED;
  if (clusters.length > 0) {
    let best = -Infinity;
    for (let k = 0; k < AXIS_SAMPLES; k += 1) {
      const a = -Math.PI + (k * Math.PI * 2) / AXIS_SAMPLES;
      let clearance = Infinity;
      for (const c of clusters) {
        clearance = Math.min(clearance, Math.abs(wrap(a - c.angle)) * Math.max(1, Math.hypot(c.chip.x, c.chip.y)) - c.footprint);
      }
      const score = clearance - Math.abs(wrap(a - AXIS_PREFERRED)) * AXIS_BIAS;
      if (score > best) {
        best = score;
        axisAngle = a;
      }
    }
  }

  const sortedPitches = [...elementPitches].sort((a, b) => a - b);
  const medianElementPitch = sortedPitches.length ? sortedPitches[Math.floor(sortedPitches.length / 2)]! : room;

  const pad = 2 * P;
  const extent: Box = { minX: -tokens.hubClearance, minY: -tokens.hubClearance, maxX: tokens.hubClearance, maxY: tokens.hubClearance };
  const grow = (centre: Point, r: number) => {
    extent.minX = Math.min(extent.minX, centre.x - r);
    extent.maxX = Math.max(extent.maxX, centre.x + r);
    extent.minY = Math.min(extent.minY, centre.y - r);
    extent.maxY = Math.max(extent.maxY, centre.y + r);
  };
  for (const c of clusters) grow(c.chip, c.footprint);
  if (orphanIds.length > 0) grow(orphanCentre, orphanRadius);
  extent.minX -= pad;
  extent.minY -= pad;
  extent.maxX += pad;
  extent.maxY += pad;

  return {
    order: [...order],
    rings,
    clusters,
    clusterByDomain: new Map(clusters.map((c) => [c.domainId, c])),
    itemById,
    orphans: { ids: orphanIds, centre: orphanCentre, pitch: orphanPitch, radius: orphanRadius },
    axisAngle,
    extent,
    positions,
    medianElementPitch,
    memory: {
      order: [...order],
      radiusByStep: new Map(rings.map((r) => [r.step, r.radius])),
      angleById: new Map([...placed].map(([id, at]) => [id, { step: at.step, angle: at.angle }])),
      itemOrder,
    },
  };
}
