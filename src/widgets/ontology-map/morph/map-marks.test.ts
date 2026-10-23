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

vi.mock("../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => mapTokens }));
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
for (let d = 0; d < 7; d += 1) {
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
    nodes, edges, hexPlacement: null, expandStructure: "disc", overviewFit: "spine", expandedParents: new Set(), dialMemory: memory,
  }, host)!;
  const hub = target.marks.find((m) => m.id === "p")!;
  return target.marks
    .filter((m) => /^d\d$/.test(m.id))
    .map((m) => ({ id: m.id, column: m.x < hub.x ? 0 : 1, y: m.y }))
    .sort((a, b) => a.column - b.column || a.y - b.y)
    .map((m) => m.id);
}

describe("predicted Flat marks under the dial", () => {
  it("lands the domains in the remembered branch order", () => {
    const fresh = domainSequence(null);
    expect(fresh).toHaveLength(7);
    const remembered = [fresh[0]!, fresh[2]!, fresh[1]!, fresh[4]!, fresh[3]!, fresh[6]!, fresh[5]!];
    const memory: DialMemory = { order: remembered, radiusByStep: new Map(), angleById: new Map(), itemOrder: new Map() };
    const seq = domainSequence(memory);
    expect(seq).not.toEqual(fresh);
    expect(seq).toEqual(remembered);
  });
});
