import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveDialTokens } from "../dial/tokens";
import type { DialMemory } from "../dial/types";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const dialTokens = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const mapTokens = {
  radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5,
  layoutRingDomain: 250, layoutRingCapability: 145, layoutRingElement: 90,
  edgeBowContains: 70, edgeBowDepends: 92, edgeBlendContains: 0.46, edgeBlendDepends: 0.62, starCount: 2,
  cameraScaleMax: 4, cameraScaleMin: 0.05, cameraSmallGraphScaleMax: 2, overviewEntryRatio: 0.95,
  safeInsetTop: 0, safeInsetBottom: 0, safeInsetLeft: 0, safeInsetRight: 0,
} as unknown as OntologyMapTokens;

vi.mock("../ui/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => mapTokens }));
vi.mock("../dial/tokens", async (load) => ({ ...(await load<typeof import("../dial/tokens")>()), readDialTokens: () => dialTokens }));

const { predictMapLayoutTarget } = await import("./map-marks");

const mapNode = (id: string, kind: OntologyMapNode["kind"]): OntologyMapNode => ({
  id, label: id, kind, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0,
});
const edge = (source: string, target: string, relationType: string): OntologyMapEdge => ({
  source, target, relationType, relationQuality: null, evidenceCount: 0, kind: relationType === "contains" ? "contains" : "depends", declaredBySlug: null,
});
const nodes: OntologyMapNode[] = [mapNode("p", "project")];
const edges: OntologyMapEdge[] = [];
for (let d = 0; d < 5; d += 1) {
  nodes.push(mapNode(`d${d}`, "domain"));
  edges.push(edge("p", `d${d}`, "contains"));
  for (let c = 0; c < 3; c += 1) {
    nodes.push(mapNode(`d${d}c${c}`, "capability"));
    edges.push(edge(`d${d}`, `d${d}c${c}`, "contains"));
  }
}

const host = document.createElement("canvas");
host.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON: () => ({}) });
document.body.append(host);

function domainSequence(memory: DialMemory | null): string[] {
  const target = predictMapLayoutTarget("flat", {
    nodes, edges, territoryStats: () => ({ text: "" }), hexPlacement: null, expandStructure: "disc", overviewFit: "spine", expandedParents: new Set(), dialMemory: memory,
  }, host)!;
  const hub = target.marks.find((m) => m.id === "p")!;
  return target.marks
    .filter((m) => /^d\d$/.test(m.id))
    .map((m) => ({ id: m.id, angle: (Math.atan2(m.y - hub.y, m.x - hub.x) + Math.PI * 4) % (Math.PI * 2) }))
    .sort((a, b) => a.angle - b.angle)
    .map((m) => m.id);
}

const cyclic = (seq: readonly string[]) => {
  const first = [...seq].sort()[0]!;
  const at = seq.indexOf(first);
  return [...seq.slice(at), ...seq.slice(0, at)];
};

describe("predicted Flat marks under the dial", () => {
  it("land the domains in the remembered ring order, not the default one", () => {
    const fresh = domainSequence(null);
    expect(fresh).toHaveLength(5);
    const remembered = [fresh[0]!, fresh[2]!, fresh[1]!, fresh[4]!, fresh[3]!];
    const memory: DialMemory = { order: remembered, radiusByStep: new Map(), angleById: new Map(), itemOrder: new Map() };
    const seq = domainSequence(memory);
    expect(cyclic(seq)).not.toEqual(cyclic(fresh));
    expect([cyclic(remembered), cyclic([...remembered].reverse())]).toContainEqual(cyclic(seq));
  });
});
