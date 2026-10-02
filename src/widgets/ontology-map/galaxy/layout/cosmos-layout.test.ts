import { describe, expect, it } from "vitest";
import { computeCosmosLayout, type CosmosLayout } from "./cosmos-layout";
import { classifyGalaxy } from "./cosmos-morphology";
import { voidGap } from "./cosmos-physics";

type Kind = "project" | "domain" | "capability" | "element";

function synth(n: number) {
  const domains = Math.max(1, Math.round(Math.sqrt(n) / 3));
  const capabilities = Math.round(n * 0.15);
  const elements = n - 1 - domains - capabilities;
  const nodes: { id: string; label: string; kind: Kind; size: number; fullDegree: number }[] = [];
  const edges: { source: string; target: string; kind: "contains" | "depends"; relationType: string }[] = [];
  const node = (id: string, kind: Kind) => nodes.push({ id, label: id, kind, size: 1, fullDegree: 1 });
  const contains = (source: string, target: string) => edges.push({ source, target, kind: "contains", relationType: "contains" });
  const hash = (v: number) => {
    let h = Math.imul(v | 0, 0x9e3779b1) ^ 0x6a09e667;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  node("synth-project", "project");
  for (let d = 0; d < domains; d += 1) {
    node(`synth-domain-${d}`, "domain");
    contains("synth-project", `synth-domain-${d}`);
  }
  for (let c = 0; c < capabilities; c += 1) {
    node(`synth-cap-${c}`, "capability");
    contains(`synth-domain-${c % domains}`, `synth-cap-${c}`);
  }
  for (let e = 0; e < elements; e += 1) {
    node(`synth-el-${e}`, "element");
    if (e % 5 === 0) contains(`synth-domain-${e % domains}`, `synth-el-${e}`);
    else contains(`synth-cap-${Math.floor(capabilities * hash(e) ** 2)}`, `synth-el-${e}`);
  }
  for (let c = 0; c < capabilities; c += 1) {
    const domain = c % domains;
    const target = hash(c * 3) < 0.76 ? domain : (domain + [1, 2, 5][c % 3]!) % domains;
    const pick = target + domains * Math.floor(hash(c * 3 + 1) * Math.floor(capabilities / domains));
    if (pick !== c && pick < capabilities) edges.push({ source: `synth-cap-${c}`, target: `synth-cap-${pick}`, kind: "depends", relationType: "depends_on" });
  }
  return { nodes, edges };
}

function maxShift(a: CosmosLayout, b: CosmosLayout, skip: (id: string) => boolean): number {
  let max = 0;
  for (const [id, p] of b.points) {
    const q = a.points.get(id);
    if (!q || skip(id)) continue;
    max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return max;
}

describe("cosmos layout", () => {
  const base = synth(2000);
  const layout = computeCosmosLayout(base.nodes, base.edges);

  it("places every concept, once", () => {
    expect(layout.points.size).toBe(base.nodes.length);
    for (const node of base.nodes) expect(layout.points.has(node.id)).toBe(true);
  });

  it("draws the same sky from the same vault, whatever the input order", () => {
    const again = computeCosmosLayout(base.nodes, base.edges);
    const shuffled = computeCosmosLayout([...base.nodes].reverse(), [...base.edges].reverse());
    for (const [id, p] of layout.points) {
      expect(again.points.get(id)).toEqual(p);
      expect(shuffled.points.get(id)).toEqual(p);
    }
  });

  it("keeps a dark void between every pair of galaxies and around the core", () => {
    const gs = layout.galaxies;
    const mean = gs.reduce((s, g) => s + g.radius, 0) / gs.length;
    for (let i = 0; i < gs.length; i += 1) {
      const a = gs[i]!;
      expect(Math.hypot(a.x, a.y)).toBeGreaterThanOrEqual(a.radius + layout.core.radius + voidGap(a.radius, layout.core.radius, mean) * 0.8);
      for (let j = i + 1; j < gs.length; j += 1) {
        const b = gs[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.radius + b.radius + voidGap(a.radius, b.radius, mean) * 0.8);
      }
    }
  });

  it("sits galaxies that depend on each other closer than those that do not", () => {
    const linked = new Set(layout.filaments.map((f) => `${Math.min(f.from, f.to)}:${Math.max(f.from, f.to)}`));
    let l = 0;
    let ln = 0;
    let u = 0;
    let un = 0;
    layout.galaxies.forEach((a, i) =>
      layout.galaxies.forEach((b, j) => {
        if (j <= i) return;
        const d = Math.hypot(a.x - b.x, a.y - b.y) / (a.radius + b.radius);
        if (linked.has(`${i}:${j}`)) {
          l += d;
          ln += 1;
        } else {
          u += d;
          un += 1;
        }
      }),
    );
    expect(l / ln).toBeLessThan((u / un) * 0.95);
  });

  it("moves no other galaxy visibly when one element is added (fresh settle: under 1 overview px)", () => {
    const added = { nodes: [...base.nodes, { id: "new-el", label: "New", kind: "element" as Kind, size: 1, fullDegree: 1 }], edges: [...base.edges, { source: layout.galaxies[2]!.clusters[0]!.id, target: "new-el", kind: "contains" as const, relationType: "contains" }] };
    const after = computeCosmosLayout(added.nodes, added.edges);
    const touched = layout.galaxies[2]!.id;
    const b = layout.bounds;
    const overviewScale = Math.min(1050 / (b.maxX - b.minX), 790 / (b.maxY - b.minY));
    const shift = maxShift(layout, after, (id) => (after.galaxyOf.get(id) ?? -1) >= 0 && after.galaxies[after.galaxyOf.get(id)!]!.id === touched);
    expect(shift * overviewScale).toBeLessThan(1);
  });

  it("with a placement record, a new domain moves no recorded galaxy", () => {
    const record = layout.placement;
    const grown = {
      nodes: [...base.nodes, { id: "new-domain", label: "New domain", kind: "domain" as Kind, size: 1, fullDegree: 1 }],
      edges: [...base.edges, { source: "synth-project", target: "new-domain", kind: "contains" as const, relationType: "contains" }],
    };
    const after = computeCosmosLayout(grown.nodes, grown.edges, { placement: record });
    for (const g of after.galaxies) {
      const c = record.centres[g.id];
      if (!c) continue;
      expect(Math.hypot(g.x - c[0], g.y - c[1])).toBeLessThan(0.01);
    }
    const again = computeCosmosLayout(base.nodes, base.edges, { placement: record });
    expect(again.placement).toEqual(record);
  });

  const overviewScaleOf = (l: CosmosLayout) => Math.min(1050 / (l.bounds.maxX - l.bounds.minX), 790 / (l.bounds.maxY - l.bounds.minY));
  const galaxyIdOf = (l: CosmosLayout, id: string) => {
    const g = l.galaxyOf.get(id) ?? -1;
    return g >= 0 ? l.galaxies[g]!.id : null;
  };
  const expectPinned = (after: CosmosLayout, record: CosmosLayout["placement"], skip: ReadonlySet<string> = new Set()) => {
    let checked = 0;
    for (const g of after.galaxies) {
      const c = record.centres[g.id];
      if (!c || skip.has(g.id)) continue;
      expect(Math.hypot(g.x - c[0], g.y - c[1])).toBeLessThan(0.01);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  };

  it("moves no unrelated star visibly when one element is removed (fresh settle: under 1 overview px)", () => {
    const gone = layout.galaxies[3]!.clusters[0]!;
    const victim = layout.galaxies[3]!.starIds.find((id, i) => layout.galaxies[3]!.starCluster[i] === 0 && id !== gone.id)!;
    const after = computeCosmosLayout(
      base.nodes.filter((n) => n.id !== victim),
      base.edges.filter((e) => e.target !== victim && e.source !== victim),
    );
    const touched = layout.galaxies[3]!.id;
    expect(maxShift(layout, after, (id) => galaxyIdOf(after, id) === touched) * overviewScaleOf(layout)).toBeLessThan(1);
  });

  it("with a placement record, a new cross-domain dependency moves no recorded galaxy", () => {
    const a = layout.galaxies[0]!.clusters[0]!.id;
    const b = layout.galaxies[layout.galaxies.length - 1]!.clusters[0]!.id;
    const after = computeCosmosLayout(base.nodes, [...base.edges, { source: a, target: b, kind: "depends", relationType: "depends_on" }], { placement: layout.placement });
    expectPinned(after, layout.placement);
  });

  it("keeps an absent domain's centre in the record, so it returns where it was", () => {
    const record = layout.placement;
    const d = layout.galaxies[4]!;
    const members = new Set(d.starIds);
    const without = computeCosmosLayout(
      base.nodes.filter((n) => !members.has(n.id)),
      base.edges.filter((e) => !members.has(e.source) && !members.has(e.target)),
      { placement: record },
    );
    expect(without.placement.centres[d.id]).toEqual(record.centres[d.id]);
    const back = computeCosmosLayout(base.nodes, base.edges, { placement: without.placement });
    const returned = back.galaxies.find((g) => g.id === d.id)!;
    expect(Math.hypot(returned.x - d.x, returned.y - d.y)).toBeLessThan(0.01);
    const fresh = computeCosmosLayout(base.nodes.filter((n) => !members.has(n.id)), base.edges, { placement: record, fresh: true });
    expect(fresh.placement.centres[d.id]).toBeUndefined();
  });

  it("separates two pinned galaxies when one grows into the other, and moves no other", () => {
    const record = layout.placement;
    const a = layout.galaxies[0]!;
    const moved = (l: CosmosLayout) =>
      l.galaxies.filter((g) => {
        const c = record.centres[g.id]!;
        return Math.hypot(g.x - c[0], g.y - c[1]) >= 0.01;
      });
    let after = layout;
    for (let k = 1; moved(after).length === 0 && k <= 40; k += 1) {
      const grow = Array.from({ length: Math.ceil((a.members * k) / 8) }, (_, n) => `grown-${n}`);
      after = computeCosmosLayout(
        [...base.nodes, ...grow.map((id) => ({ id, label: id, kind: "element" as Kind, size: 1, fullDegree: 1 }))],
        [...base.edges, ...grow.map((id) => ({ source: a.id, target: id, kind: "contains" as const, relationType: "contains" }))],
        { placement: record },
      );
    }
    const pushed = moved(after).map((g) => g.id).sort();
    expect(pushed).toHaveLength(2);
    expect(pushed).toContain(a.id);
    const [a2, b2] = [after.galaxies.find((g) => g.id === a.id)!, after.galaxies.find((g) => g.id !== a.id && pushed.includes(g.id))!];
    const mean = after.galaxies.reduce((sum, g) => sum + g.radius, 0) / after.galaxies.length;
    expect(Math.hypot(a2.x - b2.x, a2.y - b2.y)).toBeGreaterThanOrEqual(a2.radius + b2.radius + voidGap(a2.radius, b2.radius, mean) * 0.82 - 1e-6);
    expectPinned(after, record, new Set(pushed));
    expect(after.placement.centres[a.id]).toEqual([Math.round(a2.x * 100) / 100, Math.round(a2.y * 100) / 100]);
  });

  it("re-places only the galaxy a one-element change touches", () => {
    const k = layout.galaxies.findIndex((g) => g.starCluster.some((c, i) => c === -1 && i > 0));
    const g = layout.galaxies[k]!;
    const field = g.starIds.find((_, i) => i > 0 && g.starCluster[i] === -1)!;
    const swapped = {
      nodes: base.nodes.map((n) => (n.id === field ? { ...n, id: "swapped-field" } : n)),
      edges: base.edges.map((e) => (e.target === field ? { ...e, target: "swapped-field" } : e)),
    };
    computeCosmosLayout(base.nodes, base.edges);
    expect(computeCosmosLayout(swapped.nodes, swapped.edges).timings.placedGalaxies).toBe(1);
    expect(computeCosmosLayout(swapped.nodes, swapped.edges).timings.placedGalaxies).toBe(0);
  });

  it("picks a galaxy's shape from that domain alone, by absolute thresholds", () => {
    expect(classifyGalaxy({ members: 9, cohesion: 2, concentration: 1 })).toBe("irregular");
    expect(classifyGalaxy({ members: 40, cohesion: 0.2, concentration: 0.45 })).toBe("elliptical");
    expect(classifyGalaxy({ members: 40, cohesion: 0.95, concentration: 0.1 })).toBe("elliptical");
    expect(classifyGalaxy({ members: 40, cohesion: 0.4, concentration: 0.2 })).toBe("spiral");
  });
});
