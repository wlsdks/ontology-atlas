import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import type { TerritoryInputEdge, TerritoryInputNode } from "./territories-layout";
import {
  computeHexBoard,
  fitHexRadius,
  hexBucket,
  hexLineSpills,
  hexNeighborInDirection,
  hexTileLines,
  HEX_BAND_NAMES,
  HEX_TYPE,
  middleTruncate,
  minNamesRadius,
  type HexBoardLayout,
  type HexTextRole,
} from "./hex-board";
import { axialRound, axialToUnit, hexDistance, hexKey, hexSpiral, HEX_NEIGHBORS, insideHex, ringsFor, unitToAxial } from "./hex-grid";
import { buildHexLattice, closedNodes, HexRouter, pickPillSpot } from "./hex-router";

/** A conservative width model: Hangul full-width, Latin a little over half an em. */
function measure(text: string, role: HexTextRole): number {
  const px = HEX_TYPE[role === "capabilityStrong" ? "capability" : role];
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (role === "mono") w += px * 0.61;
    else if (code >= 0x1100) w += px * 0.95;
    else if (ch === " ") w += px * 0.3;
    else if (/[A-Z0-9]/.test(ch)) w += px * 0.64;
    else w += px * 0.56;
  }
  return w;
}

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

/** `capabilityCount` capabilities over `domainCount` domains, unevenly, with dependencies. */
function synthetic(capabilityCount: number, domainCount: number): { nodes: TerritoryInputNode[]; edges: TerritoryInputEdge[] } {
  const nodes: TerritoryInputNode[] = [{ id: "project:p", label: "합성 프로젝트", kind: "project" }];
  const edges: TerritoryInputEdge[] = [];
  const words = ["결제", "재고 동기화", "알림 발송", "권한", "보고서 생성기", "검색 색인", "배송 라벨"];
  for (let d = 0; d < domainCount; d++) {
    nodes.push({ id: `domain:d${String(d).padStart(2, "0")}`, label: `도메인 ${d}`, kind: "domain" });
    edges.push({ source: "project:p", target: `domain:d${String(d).padStart(2, "0")}`, kind: "contains", relationType: "contains" });
  }
  for (let c = 0; c < capabilityCount; c++) {
    const d = c % (domainCount + 2) >= domainCount ? 0 : c % domainCount;
    const id = `capability:c${String(c).padStart(4, "0")}`;
    nodes.push({ id, label: `${words[c % words.length]} ${c}`, kind: "capability" });
    edges.push({ source: `domain:d${String(d).padStart(2, "0")}`, target: id, kind: "contains", relationType: "contains" });
    for (let e = 0; e < (c * 7) % 9; e++) {
      const el = `element:e${c}-${e}`;
      nodes.push({ id: el, label: `요소 ${c}-${e}`, kind: "element" });
      edges.push({ source: id, target: el, kind: "contains", relationType: "contains" });
    }
    if (c > 3) {
      const t = `capability:c${String((c * 13) % c).padStart(4, "0")}`;
      edges.push({ source: id, target: t, kind: "depends", relationType: "depends_on" });
    }
  }
  return { nodes, edges };
}

const cellsOf = (layout: HexBoardLayout) => new Map(layout.tiles.map((t) => [t.id, [t.q, t.r] as const]));

describe("hex grid maths", () => {
  it("places flat-top centres at x = 1.5q, y = √3(r + q/2)", () => {
    expect(axialToUnit(2, -1)).toEqual({ x: 3, y: 0 });
    const c = axialToUnit(0, 1);
    expect(c.x).toBe(0);
    expect(c.y).toBeCloseTo(Math.sqrt(3));
  });

  it("measures ring distance and rounds points back to their cell", () => {
    expect(hexDistance([0, 0], [2, -1])).toBe(2);
    expect(hexDistance([1, 1], [-1, 2])).toBe(2);
    for (const [q, r] of hexSpiral(61)) {
      const u = axialToUnit(q, r);
      expect(unitToAxial(u.x + 0.3, u.y - 0.2)).toEqual([q, r]);
    }
    expect(axialRound(0.1, -0.05)).toEqual([0, 0]);
  });

  it("walks a spiral ring by ring, each slot fixed however many are asked for", () => {
    const s = hexSpiral(19);
    expect(s).toHaveLength(19);
    expect(new Set(s.map(([q, r]) => hexKey(q, r))).size).toBe(19);
    s.forEach(([q, r], i) => expect(hexDistance([q, r], [0, 0])).toBe(i === 0 ? 0 : i <= 6 ? 1 : 2));
    expect(hexSpiral(40).slice(0, 19)).toEqual(s);
  });

  it("neighbours sit across the edge they are listed for", () => {
    HEX_NEIGHBORS.forEach(([dq, dr], i) => {
      const n = axialToUnit(dq, dr);
      const a = ((i + 0.5) * Math.PI) / 3;
      expect(Math.atan2(n.y, n.x)).toBeCloseTo(Math.atan2(Math.sin(a), Math.cos(a)));
    });
    expect(ringsFor(0)).toBe(0);
    expect(ringsFor(6)).toBe(1);
    expect(ringsFor(7)).toBe(2);
    expect(ringsFor(18)).toBe(2);
    expect(insideHex(0.99, 0, 1)).toBe(true);
    expect(insideHex(0, 0.87, 1)).toBe(false);
  });

  it("buckets element counts 0, 1–2, 3–4, 5–6, 7+", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 30].map(hexBucket)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe("hex board placement", () => {
  it("gives every concept of the dogfood vault its own cell, regions contiguous and apart", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    const caps = nodes.filter((n) => n.kind === "capability").length;
    expect(layout.capabilities).toHaveLength(caps);
    expect(layout.domains).toHaveLength(nodes.filter((n) => n.kind === "domain").length);
    expect(layout.occupied.size).toBe(layout.tiles.length);
    for (const region of layout.regions) {
      // Contiguous: every capability cell touches another cell of its region.
      const keys = new Set(region.cells.map(([q, r]) => hexKey(q, r)));
      for (const [q, r] of region.cells.slice(1)) {
        expect(HEX_NEIGHBORS.some(([dq, dr]) => keys.has(hexKey(q + dq, r + dr)))).toBe(true);
      }
    }
    // Apart: no cell of one region touches a cell of another (the moat).
    const regionOf = new Map<string, string>();
    for (const region of layout.regions) for (const [q, r] of region.cells) regionOf.set(hexKey(q, r), region.domainId);
    for (const [key, domain] of regionOf) {
      const [q, r] = key.split(",").map(Number) as [number, number];
      for (const [dq, dr] of HEX_NEIGHBORS) {
        const other = regionOf.get(hexKey(q + dq, r + dr));
        if (other) expect(other).toBe(domain);
      }
    }
    expect(layout.reflowed).toBe(false);
  });

  it("is deterministic", () => {
    const { nodes, edges } = dogfoodGraph();
    expect([...cellsOf(computeHexBoard(nodes, edges))]).toEqual([...cellsOf(computeHexBoard([...nodes].reverse(), [...edges].reverse()))]);
  });

  it("appending a capability keeps every other cell byte-identical", () => {
    const { nodes, edges } = dogfoodGraph();
    const first = computeHexBoard(nodes, edges, { aspect: 1.6 });
    const domain = first.regions[1]!.domainId;
    // An id that sorts first: a pure re-layout would have shifted the whole region.
    const extra = { id: "capability:000-new", label: "새 역량", kind: "capability" as const };
    const second = computeHexBoard([...nodes, extra], [...edges, { source: domain, target: extra.id, kind: "contains", relationType: "contains" }], {
      prior: first.record,
      aspect: 0.8,
    });
    const before = cellsOf(first);
    const after = cellsOf(second);
    for (const [id, cell] of before) expect(after.get(id), id).toEqual(cell);
    const placed = second.byId.get(extra.id)!;
    expect(placed.domainId).toBe(domain);
    expect(first.occupied.has(hexKey(placed.q, placed.r))).toBe(false);
    expect(second.reflowed).toBe(false);
  });

  it("a deleted capability leaves a hole, and the next new one fills it", () => {
    const { nodes, edges } = dogfoodGraph();
    const first = computeHexBoard(nodes, edges);
    const gone = first.regions[0]!.capabilityIds[2]!;
    const goneCell = cellsOf(first).get(gone)!;
    const without = computeHexBoard(
      nodes.filter((n) => n.id !== gone),
      edges.filter((e) => e.source !== gone && e.target !== gone),
      { prior: first.record },
    );
    for (const [id, cell] of cellsOf(without)) expect(cell, id).toEqual(cellsOf(first).get(id));
    expect(without.occupied.has(hexKey(goneCell[0], goneCell[1]))).toBe(false);
    // The hole is remembered, so a later capability of that domain lands in it.
    const extra = { id: "capability:zzz-later", label: "나중 역량", kind: "capability" as const };
    const later = computeHexBoard(
      [...nodes.filter((n) => n.id !== gone), extra],
      [...edges.filter((e) => e.source !== gone && e.target !== gone), { source: first.regions[0]!.domainId, target: extra.id, kind: "contains", relationType: "contains" }],
      { prior: without.record },
    );
    const at = later.byId.get(extra.id)!;
    for (const [id, cell] of cellsOf(without)) expect(cellsOf(later).get(id), id).toEqual(cell);
    expect(later.occupied.get(hexKey(at.q, at.r))).toBe(extra.id);
  });

  it("a new domain takes a free spiral slot and nothing else moves", () => {
    const { nodes, edges } = dogfoodGraph();
    const first = computeHexBoard(nodes, edges);
    const dom = { id: "domain:new", label: "새 도메인", kind: "domain" as const };
    const cap = { id: "capability:new-in-new", label: "새 판의 역량", kind: "capability" as const };
    const second = computeHexBoard([...nodes, dom, cap], [...edges, { source: dom.id, target: cap.id, kind: "contains", relationType: "contains" }], {
      prior: first.record,
    });
    for (const [id, cell] of cellsOf(first)) expect(cellsOf(second).get(id), id).toEqual(cell);
    expect(second.byId.get(cap.id)?.domainId).toBe(dom.id);
    expect(second.reflowed).toBe(false);
  });

  it("an overflowing region re-seeds the board once, and says so", () => {
    const { nodes, edges } = synthetic(12, 3);
    const first = computeHexBoard(nodes, edges);
    const more = synthetic(90, 3);
    const grown = computeHexBoard(more.nodes, more.edges, { prior: first.record });
    expect(grown.reflowed).toBe(true);
    expect(grown.capabilities).toHaveLength(90);
    expect(grown.reg).toBeGreaterThan(first.reg);
  });

  it("places 300 capabilities over 18 domains, every one on its own cell", () => {
    const { nodes, edges } = synthetic(300, 18);
    const layout = computeHexBoard(nodes, edges);
    expect(layout.capabilities).toHaveLength(300);
    expect(layout.occupied.size).toBe(layout.tiles.length);
    expect(layout.reflowed).toBe(false);
  });

  it("rolls cross-region reliance into canals, opposite directions merged", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    expect(layout.canals.length).toBeGreaterThan(0);
    const pairs = new Set<string>();
    for (const c of layout.canals) {
      const key = [c.fromDomain, c.toDomain].sort().join("|");
      expect(pairs.has(key), key).toBe(false);
      pairs.add(key);
    }
    const crossing = layout.dependencies.filter((d) => layout.byId.get(d.from)!.domainId !== layout.byId.get(d.to)!.domainId).length;
    expect(layout.canals.reduce((s, c) => s + c.count, 0)).toBe(crossing);
  });
});

describe("hex board labels", () => {
  const extrasFor = (layout: HexBoardLayout) => (t: HexBoardLayout["tiles"][number]) =>
    t.kind === "domain"
      ? (() => {
          const region = layout.regions.find((r) => r.domainId === t.id)!;
          return { meta: `역량 ${region.capabilityIds.length} · 요소 ${region.elementCount}`, stale: "◐ 낡음 9" };
        })()
      : t.kind === "project"
        ? { meta: "999 문서" }
        : {};

  for (const [name, graph, room] of [
    ["dogfood", dogfoodGraph(), { width: 1330, height: 820 }],
    ["50 capabilities", synthetic(50, 5), { width: 1330, height: 820 }],
    ["300 capabilities", synthetic(300, 18), { width: 1330, height: 820 }],
  ] as const) {
    it(`${name}: every name fits its face from the names band up, and no two tiles' text overlap`, () => {
      const layout = computeHexBoard(graph.nodes, graph.edges, { aspect: room.width / room.height });
      // The band floor is set by names alone; a title tile adds its counts only when they fit.
      const from = minNamesRadius(layout, measure);
      const linesAt = (t: HexBoardLayout["tiles"][number], R: number) => {
        const full = hexTileLines(t, R, measure, extrasFor(layout)(t));
        return hexLineSpills(full, R, measure).length === 0 ? full : hexTileLines(t, R, measure);
      };
      expect(from, "some name never fits").not.toBeNull();
      expect(from!).toBeGreaterThanOrEqual(HEX_BAND_NAMES);
      for (const R of [from!, from! + 7, 96]) {
        if (R > 96) continue;
        const boxes: { id: string; x0: number; y0: number; x1: number; y1: number }[] = [];
        for (const t of layout.tiles) {
          const lines = linesAt(t, R);
          expect(hexLineSpills(lines, R, measure), `${t.id} at R=${R}`).toEqual([]);
          for (const l of lines) {
            const w = measure(l.text, l.role);
            const size = HEX_TYPE[l.role === "capabilityStrong" ? "capability" : l.role];
            boxes.push({ id: t.id, x0: t.x * R - w / 2, x1: t.x * R + w / 2, y0: t.y * R + l.dy - size * 0.85, y1: t.y * R + l.dy + size * 0.22 });
          }
        }
        const hits: string[] = [];
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i]!;
            const b = boxes[j]!;
            if (a.id === b.id) continue;
            if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) hits.push(`${a.id} × ${b.id}`);
          }
        expect(hits, `R=${R}`).toEqual([]);
      }
      if (name === "dogfood") {
        // The real vault opens with its names on at 1512 px (spec: R = 55 there), and every
        // domain title carries its counts there.
        const R = fitHexRadius(layout.bounds, room);
        expect(R).toBeGreaterThanOrEqual(from!);
        for (const d of layout.domains) expect(hexLineSpills(hexTileLines(d, R, measure, extrasFor(layout)(d)), R, measure), d.id).toEqual([]);
      }
    });
  }

  it("truncates a file name in the middle, keeping its extension", () => {
    const t = middleTruncate("server/registry-inventory.mjs", 80, (s) => s.length * 6.7);
    expect(t.endsWith(".mjs")).toBe(true);
    expect(t).toContain("…");
  });
});

describe("hex board keyboard walk", () => {
  it("moves to the axial neighbour, and across the moat when there is none", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    for (const t of layout.capabilities) {
      for (const dir of ["up", "down", "left", "right"] as const) {
        const next = hexNeighborInDirection(layout, t.id, dir);
        if (!next) continue;
        const n = layout.byId.get(next)!;
        if (dir === "up") expect(n.y).toBeLessThan(t.y);
        if (dir === "down") expect(n.y).toBeGreaterThan(t.y);
        if (dir === "left") expect(n.x).toBeLessThan(t.x);
        if (dir === "right") expect(n.x).toBeGreaterThan(t.x);
      }
    }
    const t = layout.capabilities.find((c) => layout.occupied.has(hexKey(c.q, c.r - 1)))!;
    expect(hexNeighborInDirection(layout, t.id, "up")).toBe(layout.occupied.get(hexKey(t.q, t.r - 1)));
    // From the project, every direction reaches some tile.
    for (const dir of ["up", "down", "left", "right"] as const) expect(hexNeighborInDirection(layout, layout.project!.id, dir)).not.toBeNull();
  });
});

describe("hex board router", () => {
  const offFaces = (layout: HexBoardLayout, route: { points: { x: number; y: number }[] }, R: number) => {
    // Every sample of every segment stays out of every occupied face (face = R − gutter).
    const face = (R - (R >= 44 ? 4 : R >= 28 ? 3 : 1.5)) / R;
    const bad: string[] = [];
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i]!;
      const b = route.points[i + 1]!;
      for (let s = 0; s <= 20; s++) {
        const x = a.x + ((b.x - a.x) * s) / 20;
        const y = a.y + ((b.y - a.y) * s) / 20;
        for (const t of layout.tiles) if (insideHex(x - t.x, y - t.y, face * 0.999)) bad.push(`${t.id} @ ${x.toFixed(2)},${y.toFixed(2)}`);
      }
    }
    return bad;
  };

  it("routes every dogfood dependency without entering a tile", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    const lattice = buildHexLattice(layout);
    const router = new HexRouter(lattice);
    let routed = 0;
    for (const d of layout.dependencies) {
      const route = router.route([d.from], [d.to], `need:${layout.byId.get(d.to)!.domainId}`);
      expect(route, `${d.from} → ${d.to}`).not.toBeNull();
      expect(route!.sourceId).toBe(d.from);
      expect(route!.targetId).toBe(d.to);
      for (const R of [8, 30, 55]) expect(offFaces(layout, route!, R)).toEqual([]);
      routed++;
    }
    expect(routed).toBe(layout.dependencies.length);
  });

  it("routes canals region to region without entering a tile, and pills keep apart", () => {
    const { nodes, edges } = synthetic(300, 18);
    const layout = computeHexBoard(nodes, edges);
    const lattice = buildHexLattice(layout);
    const router = new HexRouter(lattice, 1.8);
    const pills: { x: number; y: number }[] = [];
    for (const canal of layout.canals.slice(0, 14)) {
      const a = layout.regions.find((r) => r.domainId === canal.fromDomain)!;
      const b = layout.regions.find((r) => r.domainId === canal.toDomain)!;
      const route = router.route([a.domainId, ...a.capabilityIds], [b.domainId, ...b.capabilityIds], `${a.domainId}>${b.domainId}`);
      expect(route).not.toBeNull();
      expect(offFaces(layout, route!, 8)).toEqual([]);
      const spot = pickPillSpot(layout, lattice, route!, pills, 34 / 30);
      if (spot) pills.push(spot);
    }
    for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) expect(Math.hypot(pills[i]!.x - pills[j]!.x, pills[i]!.y - pills[j]!.y)).toBeGreaterThanOrEqual(34 / 30 - 1e-9);
  });

  it("routes into one region share a trunk", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    const lattice = buildHexLattice(layout);
    // Two sources in one region, one target region: with bundling the second route reuses edges.
    const region = layout.regions.find((r) => r.capabilityIds.length >= 4)!;
    const target = layout.regions.find((r) => r.domainId !== region.domainId)!;
    const shared = (bundleB: string) => {
      const router = new HexRouter(lattice);
      const a = router.route([region.capabilityIds[0]!], [target.domainId], "T")!;
      const b = router.route([region.capabilityIds[3]!], [target.domainId], bundleB)!;
      const edgesOf = (r: typeof a) => new Set(r.nodes.slice(0, -1).map((n, i) => `${Math.min(n, r.nodes[i + 1]!)}-${Math.max(n, r.nodes[i + 1]!)}`));
      const ea = edgesOf(a);
      return [...edgesOf(b)].filter((e) => ea.has(e)).length;
    };
    expect(shared("T")).toBeGreaterThanOrEqual(shared("other"));
  });

  it("never enters a closed node: with the strip above the board closed, routes stay under it", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    const lattice = buildHexLattice(layout);
    const b = layout.bounds;
    // The strip above the board's top row is chrome (the tool lane): closed.
    const top = b.minY + 0.5;
    const closed = closedNodes(lattice, (_x, y) => y >= top);
    const open = new HexRouter(lattice, 1.15);
    const shut = new HexRouter(lattice, 1.15, closed);
    let aboveBefore = 0;
    let routed = 0;
    for (const d of layout.dependencies) {
      const before = open.route([d.from], [d.to], "x");
      if (before && before.points.some((p) => p.y < top)) aboveBefore += 1;
      const r = shut.route([d.from], [d.to], "x");
      if (!r) continue;
      routed += 1;
      expect(r.nodes.every((n) => !closed[n]), `${d.from} -> ${d.to} entered a closed node`).toBe(true);
      expect(r.points.every((p) => p.y >= top)).toBe(true);
      expect(offFaces(layout, r, 30)).toEqual([]);
    }
    // The open lattice does use that strip (the defect's shape), and closing it still routes.
    expect(aboveBefore).toBeGreaterThan(0);
    expect(routed).toBeGreaterThan(layout.dependencies.length * 0.8);
  });

  it("runs a stub toward a target it cannot reach, never an arrival", () => {
    const { nodes, edges } = dogfoodGraph();
    const layout = computeHexBoard(nodes, edges);
    const lattice = buildHexLattice(layout);
    // Close the right third of the board, as an inspector would cover it.
    const cut = layout.bounds.maxX - (layout.bounds.maxX - layout.bounds.minX) / 3;
    const closed = closedNodes(lattice, (x) => x <= cut);
    const dep = layout.dependencies.find((d) => layout.byId.get(d.from)!.x < cut - 4 && layout.byId.get(d.to)!.x > cut + 1.5);
    expect(dep, "a dependency crossing the cut").toBeTruthy();
    const r = new HexRouter(lattice, 1.15, closed).route([dep!.from], [dep!.to], "x");
    expect(r).not.toBeNull();
    expect(r!.stub).toBe(true);
    expect(r!.targetId).toBe(dep!.to);
    expect(r!.nodes.every((n) => !closed[n])).toBe(true);
    const target = layout.byId.get(dep!.to)!;
    const first = r!.points[0]!;
    const last = r!.points[r!.points.length - 1]!;
    expect(Math.hypot(last.x - target.x, last.y - target.y)).toBeLessThan(Math.hypot(first.x - target.x, first.y - target.y) - 1);
  });

  it("builds the dogfood lattice quickly", () => {
    const { nodes, edges } = dogfoodGraph();
    const lattice = buildHexLattice(computeHexBoard(nodes, edges));
    expect(lattice.xs.length).toBeGreaterThan(100);
    expect(lattice.buildMs).toBeLessThan(200);
  });
});
