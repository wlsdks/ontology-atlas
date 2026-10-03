import { describe, expect, it } from "vitest";
import { computeCosmosLayout, type CosmosLayout, type CosmosPlacementRecord } from "./cosmos-layout";

type Kind = "project" | "domain" | "capability" | "element";
type Edge = { source: string; target: string; kind: "contains" | "depends"; relationType: string };

function synth(n: number, prefix: string, domains = Math.max(1, Math.round(Math.sqrt(n) / 3)), capabilities = Math.round(n * 0.15)) {
  const elements = n - 1 - domains - capabilities;
  const nodes: { id: string; label: string; kind: Kind; size: number; fullDegree: number }[] = [];
  const edges: Edge[] = [];
  const node = (id: string, kind: Kind) => nodes.push({ id: `${prefix}${id}`, label: id, kind, size: 1, fullDegree: 1 });
  const link = (source: string, target: string, kind: Edge["kind"]) =>
    edges.push({ source: `${prefix}${source}`, target: `${prefix}${target}`, kind, relationType: kind === "contains" ? "contains" : "depends_on" });
  const hash = (v: number) => {
    let h = Math.imul(v | 0, 0x9e3779b1) ^ 0x6a09e667;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  node("project", "project");
  for (let d = 0; d < domains; d += 1) {
    node(`domain-${d}`, "domain");
    link("project", `domain-${d}`, "contains");
  }
  for (let c = 0; c < capabilities; c += 1) {
    node(`cap-${c}`, "capability");
    link(`domain-${c % domains}`, `cap-${c}`, "contains");
  }
  for (let e = 0; e < elements; e += 1) {
    node(`el-${e}`, "element");
    if (e % 5 === 0) link(`domain-${e % domains}`, `el-${e}`, "contains");
    else link(`cap-${Math.floor(capabilities * hash(e) ** 2)}`, `el-${e}`, "contains");
  }
  for (let c = 0; c < capabilities; c += 1) {
    const domain = c % domains;
    const target = hash(c * 3) < 0.76 ? domain : (domain + [1, 2, 5][c % 3]!) % domains;
    const pick = target + domains * Math.floor(hash(c * 3 + 1) * Math.floor(capabilities / domains));
    if (pick !== c && pick < capabilities) link(`cap-${c}`, `cap-${pick}`, "depends");
  }
  return { nodes, edges };
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

function rekey(record: CosmosPlacementRecord, from: string, to: string): CosmosPlacementRecord {
  return { version: 1, centres: Object.fromEntries(Object.entries(record.centres).map(([id, c]) => [to + id.slice(from.length), c])) };
}

describe("cosmos layout cost at 10k", () => {
  it("re-lays a one-element change for at most half a fresh layout, moving no unrelated star", () => {
    const fresh: number[] = [];
    const recorded: number[] = [];
    const change: number[] = [];
    let maxShiftPx = 0;
    const warm = synth(10_000, "warm-");
    computeCosmosLayout(warm.nodes, warm.edges);
    for (let run = 0; run < 3; run += 1) {
      const base = synth(10_000, `r${run}-`);
      const first = timed(() => computeCosmosLayout(base.nodes, base.edges));
      fresh.push(first.ms);
      const other = synth(10_000, `w${run}-`);
      recorded.push(timed(() => computeCosmosLayout(other.nodes, other.edges, { placement: rekey(first.value.placement, `r${run}-`, `w${run}-`) })).ms);
      const host = first.value.galaxies[2]!;
      const added = {
        nodes: [...base.nodes, { id: `r${run}-added`, label: "added", kind: "element" as Kind, size: 1, fullDegree: 1 }],
        edges: [...base.edges, { source: host.clusters[0]!.id, target: `r${run}-added`, kind: "contains" as const, relationType: "contains" }],
      };
      const next = timed(() => computeCosmosLayout(added.nodes, added.edges, { placement: first.value.placement }));
      change.push(next.ms);
      expect(next.value.timings.placedGalaxies).toBe(1);
      maxShiftPx = Math.max(maxShiftPx, unrelatedShiftPx(first.value, computeCosmosLayout(added.nodes, added.edges), host.id));
    }
    const wide = synth(3301, "wide-", 300, 3000);
    const wideMs = timed(() => computeCosmosLayout(wide.nodes, wide.edges)).ms;
    process.stderr.write(
      `cosmos layout 10k median of 3: fresh ${median(fresh).toFixed(1)} ms, with record ${median(recorded).toFixed(1)} ms, one-element change ${median(change).toFixed(1)} ms; ` +
        `300 domains x 10 capabilities fresh ${wideMs.toFixed(1)} ms; unrelated shift ${maxShiftPx.toFixed(3)} px\n`,
    );
    expect(median(change) / median(fresh)).toBeLessThanOrEqual(0.5);
    expect(maxShiftPx).toBeLessThan(1);
  }, 120_000);
});

function unrelatedShiftPx(before: CosmosLayout, after: CosmosLayout, touched: string): number {
  const b = before.bounds;
  const scale = Math.min(1050 / (b.maxX - b.minX), 790 / (b.maxY - b.minY));
  let max = 0;
  for (const [id, p] of after.points) {
    const q = before.points.get(id);
    const g = after.galaxyOf.get(id) ?? -1;
    if (!q || (g >= 0 && after.galaxies[g]!.id === touched)) continue;
    max = Math.max(max, Math.hypot(p.x - q.x, p.y - q.y));
  }
  return max * scale;
}
