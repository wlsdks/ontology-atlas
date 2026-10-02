import type { Box, DialModel, DialPetal, DialScene, DialSector, DialTokens, Point } from "./types";

type LayoutTokens = Pick<
  DialTokens,
  | "ringMin"
  | "ringSingleRowMax"
  | "rowGap"
  | "pitch"
  | "pitchMin"
  | "pitchMax"
  | "rowsMax"
  | "sectorGap"
  | "chipSlots"
  | "hubClearance"
  | "elementStart"
  | "elementPitch"
  | "orphanGap"
  | "orphanPitch"
  | "orphanRow"
  | "chordHubMargin"
  | "chordDepth"
  | "chordBow"
>;

function besideChip(petals: readonly DialPetal[]): { left: DialPetal[]; right: DialPetal[] } {
  const weight = (p: DialPetal) => p.elementIds.length + (p.direct ? -0.5 : 0);
  const sorted = [...petals].sort((a, b) => weight(b) - weight(a) || (a.id < b.id ? -1 : 1));
  const left: DialPetal[] = [];
  const right: DialPetal[] = [];
  sorted.forEach((p, i) => (i % 2 === 0 ? right : left).push(p));
  return { left, right };
}

export function chordControl(
  ringRadius: number,
  thetaA: number,
  thetaB: number,
  tokens: Pick<DialTokens, "hubClearance" | "chordHubMargin" | "chordDepth" | "chordBow">,
): Point {
  let delta = thetaB - thetaA;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const half = Math.abs(delta) / 2;
  const bisector = thetaA + delta / 2;
  const chordMid = ringRadius * Math.cos(half);
  const near = tokens.hubClearance + tokens.chordHubMargin;
  const target = near + (ringRadius * tokens.chordDepth - near) * Math.cos(half) ** tokens.chordBow;
  const rho = 2 * target - chordMid;
  return { x: Math.cos(bisector) * rho, y: Math.sin(bisector) * rho };
}

export function layoutDial(model: DialModel, order: readonly string[], tokens: LayoutTokens): DialScene {
  const n = Math.max(1, order.length);
  const slotsOf = (id: string) => {
    const d = model.domainById.get(id)!;
    return d.capabilityIds.length + (d.directElementIds.length > 0 ? 1 : 0);
  };
  const totalSlots = order.reduce((s, id) => s + slotsOf(id), 0) + n * tokens.chipSlots;
  const usable = Math.PI * 2 - n * tokens.sectorGap;
  let rows = 1;
  let ringRadius = Math.max(tokens.ringMin, (totalSlots * tokens.pitch) / usable);
  if (ringRadius > tokens.ringSingleRowMax) {
    rows = Math.min(tokens.rowsMax, Math.ceil((totalSlots * tokens.pitchMin) / usable / tokens.ringSingleRowMax));
    ringRadius = Math.max(tokens.ringMin, (totalSlots * tokens.pitchMin) / rows / usable);
  }
  const pitch = Math.max(tokens.pitchMin, Math.min(tokens.pitchMax, (usable * ringRadius * rows) / totalSlots));

  const positions = new Map<string, Point>();
  const sectors: DialSector[] = [];
  const sectorByDomain = new Map<string, DialSector>();
  const petalById = new Map<string, DialPetal>();
  const demand = order.map((id) => Math.max(2, slotsOf(id) / rows) + tokens.chipSlots);
  const demandSum = demand.reduce((s, d) => s + d, 0);
  const spans = demand.map((d) => (usable * d) / demandSum);
  let outerRadius = ringRadius;
  let cursor = -Math.PI / 2 - (spans[0] ?? 0) / 2;

  order.forEach((domainId, index) => {
    const d = model.domainById.get(domainId)!;
    const span = spans[index]!;
    const start = cursor;
    const end = cursor + span;
    cursor = end + tokens.sectorGap;
    const angle = (start + end) / 2;
    const chip = { x: Math.cos(angle) * ringRadius, y: Math.sin(angle) * ringRadius };
    positions.set(domainId, chip);

    const petals: DialPetal[] = d.capabilityIds.map((id) => ({
      id,
      angle,
      radius: ringRadius,
      row: 0,
      direct: false,
      elementIds: model.capabilityById.get(id)!.elementIds,
    }));
    if (d.directElementIds.length > 0) {
      petals.push({ id: `${domainId}::direct`, angle, radius: ringRadius, row: 0, direct: true, elementIds: d.directElementIds });
    }
    const { left, right } = besideChip(petals);
    const step = pitch / ringRadius;
    const chipHalf = (tokens.chipSlots * pitch) / 2 / ringRadius;
    const perSideRow = Math.max(1, Math.floor((span / 2 - chipHalf) / step) + 1);
    const place = (list: DialPetal[], sign: number) => {
      list.forEach((petal, i) => {
        const row = Math.min(rows - 1, Math.floor(i / perSideRow));
        const k = i - row * perSideRow;
        const r = ringRadius + row * tokens.rowGap;
        const a = angle + sign * (chipHalf + (k + 0.5) * (pitch / r) + (row % 2) * (pitch / r) * 0.5);
        petal.angle = a;
        petal.radius = r;
        petal.row = row;
        outerRadius = Math.max(outerRadius, r);
        if (!petal.direct) positions.set(petal.id, { x: Math.cos(a) * r, y: Math.sin(a) * r });
        petalById.set(petal.id, petal);
      });
    };
    place(right, 1);
    place(left, -1);
    const sector: DialSector = { domainId, angle, start, end, chip, rows, petals };
    sectors.push(sector);
    sectorByDomain.set(domainId, sector);
  });

  for (const sector of sectors) {
    for (const petal of sector.petals) {
      petal.elementIds.forEach((elementId, j) => {
        const r = outerRadius + tokens.elementStart + j * tokens.elementPitch;
        positions.set(elementId, { x: Math.cos(petal.angle) * r, y: Math.sin(petal.angle) * r });
      });
    }
  }

  const orphans = model.orphanIds.filter((id) => !positions.has(id) && id !== model.projectId);
  const orphanY = outerRadius + tokens.orphanGap;
  const perLine = Math.max(1, Math.round(tokens.orphanRow));
  orphans.forEach((id, i) => {
    const x = ((i % perLine) - (Math.min(perLine, orphans.length) - 1) / 2) * tokens.orphanPitch;
    positions.set(id, { x, y: orphanY + Math.floor(i / perLine) * tokens.orphanPitch });
  });
  if (model.projectId) positions.set(model.projectId, { x: 0, y: 0 });

  const controls = new Map<string, Point>();
  for (const flow of model.flows) {
    const a = sectorByDomain.get(flow.a);
    const b = sectorByDomain.get(flow.b);
    if (a && b) controls.set(flow.key, chordControl(ringRadius, a.angle, b.angle, tokens));
  }

  const extent: Box = { minX: -outerRadius, minY: -outerRadius, maxX: outerRadius, maxY: outerRadius };
  for (const p of positions.values()) {
    if (p.x < extent.minX) extent.minX = p.x;
    if (p.y < extent.minY) extent.minY = p.y;
    if (p.x > extent.maxX) extent.maxX = p.x;
    if (p.y > extent.maxY) extent.maxY = p.y;
  }

  return {
    order: [...order],
    ringRadius,
    outerRadius,
    pitch,
    rowGap: tokens.rowGap,
    hubClearance: tokens.hubClearance,
    sectors,
    sectorByDomain,
    petalById,
    orphans,
    positions,
    controls,
    extent,
  };
}
