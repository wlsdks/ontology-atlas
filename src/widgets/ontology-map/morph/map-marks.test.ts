import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { resolveDialTokens } from "../dial/tokens";
import { resolveFlatGraphTokens } from "../flat-graph/tokens";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const dialTokens = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const graphCss = ["app/styles/map-graph-tokens.css", "app/styles/tokens.css"].map((f) => readFileSync(f, "utf8")).join("\n");
const graphTokens = resolveFlatGraphTokens((v) => graphCss.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? "");
const mapTokens = {
  radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5,
  layoutRingDomain: 250, layoutRingCapability: 145, layoutRingElement: 90,
  edgeBowContains: 70, edgeBowDepends: 92, edgeBlendContains: 0.46, edgeBlendDepends: 0.62, starCount: 2,
  cameraScaleMax: 4, cameraScaleMin: 0.05, cameraSmallGraphScaleMax: 2, overviewEntryRatio: 0.95,
  safeInsetTop: 0, safeInsetBottom: 0, safeInsetLeft: 0, safeInsetRight: 0,
} as unknown as OntologyMapTokens;

vi.mock("../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => mapTokens }));
vi.mock("../dial/tokens", async (load) => ({ ...(await load<typeof import("../dial/tokens")>()), readDialTokens: () => dialTokens }));
vi.mock("../flat-graph/tokens", async (load) => ({ ...(await load<typeof import("../flat-graph/tokens")>()), readFlatGraphTokens: () => graphTokens }));

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

function predicted() {
  return predictMapLayoutTarget("flat", {
    nodes, edges, hexPlacement: null, expandStructure: "disc", overviewFit: "spine", expandedParents: new Set(), dialMemory: null,
  }, host)!;
}

describe("predicted Flat marks under the domain graph", () => {
  it("lands every domain and capability, each capability nearest its own domain", () => {
    const marks = new Map(predicted().marks.map((m) => [m.id, m]));
    for (let d = 0; d < 7; d += 1) {
      const domain = marks.get(`d${d}`);
      expect(domain, `d${d}`).toBeDefined();
      for (let c = 0; c < 3; c += 1) {
        const cap = marks.get(`d${d}c${c}`)!;
        expect(cap, `d${d}c${c}`).toBeDefined();
        const own = Math.hypot(cap.x - domain!.x, cap.y - domain!.y);
        for (let o = 0; o < 7; o += 1) {
          if (o === d) continue;
          const other = marks.get(`d${o}`)!;
          expect(Math.hypot(cap.x - other.x, cap.y - other.y), `d${d}c${c} vs d${o}`).toBeGreaterThan(own);
        }
      }
    }
  });

  it("predicts the same marks twice", () => {
    expect(predicted().marks).toEqual(predicted().marks);
  });
});
