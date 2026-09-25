import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import {
  boxesOverlap,
  computeTerritoryLayout,
  placeTerritoryCluster,
  territoryClusterAvoid,
  territorySatellites,
  TERRITORY_GEOMETRY,
  type TerritoryInputEdge,
  type TerritoryInputNode,
  type TerritoryLayout,
  type TerritoryTextRole,
} from "./territories-layout";

const FONT_PX: Record<TerritoryTextRole, number> = {
  project: TERRITORY_GEOMETRY.projectFontPx,
  domain: TERRITORY_GEOMETRY.domainFontPx,
  domainStats: TERRITORY_GEOMETRY.domainStatsFontPx,
  capability: TERRITORY_GEOMETRY.capabilityFontPx,
  element: 10,
  chip: TERRITORY_GEOMETRY.chipFontPx,
};

/** A conservative width model: Hangul full-width, Latin a little over half an em. */
function measure(text: string, role: TerritoryTextRole): number {
  const px = FONT_PX[role];
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x1100) w += px * 0.95;
    else if (ch === " ") w += px * 0.3;
    else if (/[A-Z0-9]/.test(ch)) w += px * 0.64;
    else w += px * 0.56;
  }
  return w;
}

const options = {
  measure,
  domainStats: ({ capabilityCount, elementCount }: { capabilityCount: number; elementCount: number }) =>
    `역량 ${capabilityCount} · 요소 ${elementCount} · 낡음 0`,
};

function dogfoodGraph(): { nodes: TerritoryInputNode[]; edges: TerritoryInputEdge[] } {
  const derivation = deriveOntologyFromVault(resolveStaticVaultSource("dogfood").manifest);
  const kinds = new Set(["project", "domain", "capability", "element"]);
  const nodes = derivation.nodes
    .filter((n) => kinds.has(n.kind))
    .map((n) => ({
      id: n.id,
      label: n.displayLocales?.ko ?? n.display ?? n.title,
      kind: n.kind as TerritoryInputNode["kind"],
    }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = derivation.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({
      source: e.from,
      target: e.to,
      kind: (e.type === "contains" ? "contains" : "depends") as TerritoryInputEdge["kind"],
      relationType: e.type,
    }));
  return { nodes, edges };
}

function synthetic(capabilityCount: number, domainCount: number): { nodes: TerritoryInputNode[]; edges: TerritoryInputEdge[] } {
  const nodes: TerritoryInputNode[] = [{ id: "project:p", label: "합성 프로젝트", kind: "project" }];
  const edges: TerritoryInputEdge[] = [];
  const words = ["결제", "Checkout flow", "재고 동기화", "Search index", "알림 발송", "Shipment label printer", "권한", "보고서 생성기"];
  for (let d = 0; d < domainCount; d++) {
    nodes.push({ id: `domain:d${d}`, label: `도메인 ${d} ${words[d % words.length]}`, kind: "domain" });
    edges.push({ source: "project:p", target: `domain:d${d}`, kind: "contains", relationType: "contains" });
  }
  for (let c = 0; c < capabilityCount; c++) {
    // Uneven territories: the first domain takes a larger share.
    const d = c % (domainCount + 1) === domainCount ? 0 : c % domainCount;
    const id = `capability:c${c}`;
    nodes.push({ id, label: `${words[c % words.length]} ${c}`, kind: "capability" });
    edges.push({ source: `domain:d${d}`, target: id, kind: "contains", relationType: "contains" });
    const elementCount = (c * 7) % 9;
    for (let e = 0; e < elementCount; e++) {
      const eid = `element:c${c}e${e}`;
      nodes.push({ id: eid, label: `요소 ${c}-${e}`, kind: "element" });
      edges.push({ source: id, target: eid, kind: "contains", relationType: "contains" });
    }
    if (c > 0) edges.push({ source: id, target: `capability:c${(c * 13) % c}`, kind: "depends", relationType: "depends_on" });
  }
  return { nodes, edges };
}

/** Every pair of placed boxes that overlap. The layout promises none. */
function overlaps(layout: TerritoryLayout): string[] {
  const out: string[] = [];
  const all = layout.boxes;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (boxesOverlap(all[i]!.box, all[j]!.box)) out.push(`${all[i]!.id}:${all[i]!.role} × ${all[j]!.id}:${all[j]!.role}`);
    }
  }
  return out;
}

function inSector(angle: number, start: number, end: number): boolean {
  const twoPi = 2 * Math.PI;
  const rel = (((angle - start) % twoPi) + twoPi) % twoPi;
  return rel <= end - start + 1e-9;
}

describe("computeTerritoryLayout", () => {
  it("names every dogfood capability around its own domain with nothing overlapping", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeTerritoryLayout(nodes, edges, options);
    const capabilityIds = nodes.filter((n) => n.kind === "capability").map((n) => n.id).sort();
    expect(capabilityIds.length).toBeGreaterThan(20);
    expect(layout.capabilities.map((c) => c.id).sort()).toEqual(capabilityIds);
    expect(layout.domains.length).toBeGreaterThanOrEqual(3);
    expect(layout.dense).toBe(false);
    expect(layout.capabilities.every((c) => c.labelReserved)).toBe(true);
    expect(overlaps(layout)).toEqual([]);
    for (const c of layout.capabilities) {
      expect(c.label.text.length).toBeGreaterThan(0);
      const domain = layout.domains.find((d) => d.id === c.domainId);
      expect(domain, `${c.id} has no territory`).toBeDefined();
      expect(inSector(c.angle, domain!.sectorStart, domain!.sectorEnd), `${c.id} left its territory`).toBe(true);
    }
  });

  it.each([
    [50, 4, false],
    [50, 6, false],
    [300, 7, true],
    [300, 20, true],
  ])("places %i synthetic capabilities in %i territories without overlap (dense: %s)", (capabilityCount, domainCount, dense) => {
    const { nodes, edges } = synthetic(capabilityCount, domainCount);
    const started = performance.now();
    const layout = computeTerritoryLayout(nodes, edges, options);
    const elapsed = performance.now() - started;
    expect(layout.capabilities).toHaveLength(capabilityCount);
    // At this scale every name is reserved; past it the overview draws discs and names on hover.
    expect(layout.dense).toBe(dense);
    expect(layout.capabilities.every((c) => c.labelReserved === !dense)).toBe(true);
    expect(overlaps(layout)).toEqual([]);
    for (const c of layout.capabilities) {
      const domain = layout.domains.find((d) => d.id === c.domainId)!;
      expect(inSector(c.angle, domain.sectorStart, domain.sectorEnd)).toBe(true);
    }
    // Pure placement, run on every graph change: it must stay well inside a frame budget of seconds.
    expect(elapsed).toBeLessThan(2000);
  });

  it("fits the dogfood vault inside a 1512 map room, and keeps every name when the room is too small", () => {
    const { nodes, edges } = dogfoodGraph();
    const room = { x: -513, y: -404, w: 1026, h: 808 };
    const fitted = computeTerritoryLayout(nodes, edges, { ...options, room });
    expect(fitted.fitsRoom).toBe(true);
    for (const { box } of fitted.boxes) {
      expect(box.x).toBeGreaterThanOrEqual(room.x);
      expect(box.y + box.h).toBeLessThanOrEqual(room.y + room.h);
    }
    const cramped = computeTerritoryLayout(nodes, edges, { ...options, room: { x: -200, y: -150, w: 400, h: 300 } });
    expect(cramped.fitsRoom).toBe(false);
    expect(cramped.capabilities).toHaveLength(fitted.capabilities.length);
    expect(overlaps(cramped)).toEqual([]);
  });

  it.each([
    ["1280x800 with INDEX open", { x: -407, y: -330, w: 834, h: 640 }],
    ["1040x720 with INDEX open", { x: -287, y: -290, w: 594, h: 560 }],
  ])("keeps every disc and every name it draws at rest inside a %s room", (_label, room) => {
    // Interaction audit, 2026-09-25: past the room the drawing went under INDEX, the tiles and
    // the bottom of the window. Inside a smaller room the rings draw in first; names that still
    // do not fit wait for hover — but nothing drawn at rest may leave the room.
    const { nodes, edges } = dogfoodGraph();
    const layout = computeTerritoryLayout(nodes, edges, { ...options, room });
    const inRoom = (b: { x: number; y: number; w: number; h: number }) =>
      b.x >= room.x && b.y >= room.y && b.x + b.w <= room.x + room.w && b.y + b.h <= room.y + room.h;
    expect(layout.fitsRoom).toBe(true);
    expect(layout.capabilities).toHaveLength(nodes.filter((n) => n.kind === "capability").length);
    for (const c of layout.capabilities) {
      expect(inRoom({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r }), `${c.id} disc outside the room`).toBe(true);
      if (c.labelReserved) expect(inRoom(c.label.box), `${c.id} name outside the room`).toBe(true);
    }
    expect(overlaps(layout)).toEqual([]);
  });

  it("slides a capability's element list off its domain's title", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeTerritoryLayout(nodes, edges, options);
    let checked = 0;
    for (const cap of layout.capabilities.filter((c) => c.elementIds.length > 0)) {
      const avoid = territoryClusterAvoid(layout, cap);
      const { plate } = placeTerritoryCluster(cap, 120, avoid);
      // Any place the list may take — beside the disc, one end still level with it.
      const n = cap.elementIds.length;
      const row = TERRITORY_GEOMETRY.satelliteRow;
      const reach = ((n - 1) / 2) * row + row;
      const shifts: number[] = [];
      for (let d = 0; d <= reach; d += row) shifts.push(d, -d);
      const clearPlaceExists = [1, -1].some((side) =>
        shifts.some((shift) => {
          const x = cap.x + side * (cap.r + TERRITORY_GEOMETRY.satelliteGap + 16);
          const top = cap.y + shift - ((n - 1) / 2) * TERRITORY_GEOMETRY.satelliteRow;
          const near = x - side * 15;
          const far = x + side * (9 + 120 + 10);
          const box = { x: Math.min(near, far), y: top - 12, w: Math.abs(far - near), h: (n - 1) * TERRITORY_GEOMETRY.satelliteRow + 24 };
          return !avoid.some((b) => boxesOverlap(box, b));
        }),
      );
      if (!clearPlaceExists) continue;
      checked += 1;
      for (const b of avoid) expect(boxesOverlap(plate, b), `${cap.id}'s list covers its name or its domain's title`).toBe(false);
    }
    expect(checked).toBeGreaterThan(5);
  });

  it("is deterministic: the same graph draws the same picture", () => {
    const { nodes, edges } = synthetic(50, 4);
    const a = computeTerritoryLayout(nodes, edges, options);
    const b = computeTerritoryLayout([...nodes].reverse(), [...edges].reverse(), options);
    expect(b.capabilities.map((c) => [c.id, c.x, c.y])).toEqual(a.capabilities.map((c) => [c.id, c.x, c.y]));
    expect(b.rollups.map((r) => [r.fromDomain, r.toDomain, r.count])).toEqual(a.rollups.map((r) => [r.fromDomain, r.toDomain, r.count]));
  });

  it("gives an element to the capability that lists it, not also to the domain", () => {
    const nodes: TerritoryInputNode[] = [
      { id: "project:p", label: "P", kind: "project" },
      { id: "domain:a", label: "A", kind: "domain" },
      { id: "capability:x", label: "X", kind: "capability" },
      { id: "element:e", label: "E", kind: "element" },
      { id: "element:loose", label: "Loose", kind: "element" },
    ];
    const edges: TerritoryInputEdge[] = [
      { source: "project:p", target: "domain:a", kind: "contains", relationType: "contains" },
      { source: "domain:a", target: "capability:x", kind: "contains", relationType: "contains" },
      { source: "domain:a", target: "element:e", kind: "contains", relationType: "contains" },
      { source: "capability:x", target: "element:e", kind: "contains", relationType: "contains" },
      { source: "domain:a", target: "element:loose", kind: "contains", relationType: "contains" },
    ];
    const layout = computeTerritoryLayout(nodes, edges, options);
    expect(layout.elementParent.get("element:e")).toBe("capability:x");
    expect(layout.elementParent.get("element:loose")).toBe("domain:a");
    expect(layout.capabilities[0]!.elementIds).toEqual(["element:e"]);
    expect(layout.domains[0]!.elementCount).toBe(2);
    expect(territorySatellites(layout.capabilities[0]!)).toHaveLength(1);
  });

  it("rolls element dependencies up to their capability and counts them per domain pair", () => {
    const nodes: TerritoryInputNode[] = [
      { id: "project:p", label: "P", kind: "project" },
      { id: "domain:a", label: "A", kind: "domain" },
      { id: "domain:b", label: "B", kind: "domain" },
      { id: "capability:a1", label: "A1", kind: "capability" },
      { id: "capability:a2", label: "A2", kind: "capability" },
      { id: "capability:b1", label: "B1", kind: "capability" },
      { id: "element:a1e", label: "A1E", kind: "element" },
      { id: "element:b1e", label: "B1E", kind: "element" },
    ];
    const c = (source: string, target: string): TerritoryInputEdge => ({ source, target, kind: "contains", relationType: "contains" });
    const d = (source: string, target: string, relationType = "depends_on"): TerritoryInputEdge => ({ source, target, kind: "depends", relationType });
    const edges = [
      c("project:p", "domain:a"),
      c("project:p", "domain:b"),
      c("domain:a", "capability:a1"),
      c("domain:a", "capability:a2"),
      c("domain:b", "capability:b1"),
      c("capability:a1", "element:a1e"),
      c("capability:b1", "element:b1e"),
      d("capability:a1", "capability:b1"),
      d("element:a1e", "element:b1e"), // rolls up to a1 → b1, a second authored edge for one pair
      d("capability:a2", "element:b1e"), // rolls up to a2 → b1
      d("capability:b1", "capability:a1"),
      d("capability:a1", "capability:a2"), // same domain: no stroke
      d("capability:a2", "capability:b1", "related_to"), // not a dependency
    ];
    const layout = computeTerritoryLayout(nodes, edges, options);
    const rollups = Object.fromEntries(layout.rollups.map((r) => [`${r.fromDomain}>${r.toDomain}`, r.count]));
    // Distinct capability edges: a1→b1 is authored twice (once through elements) and counts once.
    expect(rollups).toEqual({ "domain:a>domain:b": 2, "domain:b>domain:a": 1 });
    expect(layout.dependencies.filter((dep) => dep.from === "capability:a1" && dep.to === "capability:b1")).toHaveLength(2);
    // The two directions bow to opposite sides, so their strokes and chips do not coincide.
    const [ab, ba] = [layout.rollups.find((r) => r.fromDomain === "domain:a")!, layout.rollups.find((r) => r.fromDomain === "domain:b")!];
    expect(Math.hypot(ab.cx - ba.cx, ab.cy - ba.cy)).toBeGreaterThan(10);
  });

  it("reads belongs_to as containment stated from the child", () => {
    const nodes: TerritoryInputNode[] = [
      { id: "domain:a", label: "A", kind: "domain" },
      { id: "capability:x", label: "X", kind: "capability" },
    ];
    const layout = computeTerritoryLayout(
      nodes,
      [{ source: "capability:x", target: "domain:a", kind: "contains", relationType: "belongs_to" }],
      options,
    );
    expect(layout.capabilities[0]!.domainId).toBe("domain:a");
  });
});
