import { beforeEach, describe, expect, it, vi } from "vitest";
import { armMapLayoutMorph, disarmMapLayoutMorph, takeMapLayoutMorph } from "@/shared/lib/map-layout-morph-store";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { readHexRoom } from "../morph/hex-marks";
import { overviewCamera, worldToScreen } from "./cosmos-camera";
import { cosmosLayoutFor, cosmosLayoutRuns } from "./layout/cosmos-layout-cache";
import { predictCosmosMarks, publishCosmosSnapshot } from "./cosmos-marks";
import type { CosmosInks } from "./cosmos-types";

vi.mock("../ui/topology-read-tokens", () => ({
  readOntologyMapTokensOrNull: () => ({
    galaxyProject: "#f0d080",
    galaxyDomain: "#8090f0",
    galaxyCapability: "#a0b0ff",
    galaxyElement: "#c0c8ff",
    canvasBgFar: "#05060a",
  }),
}));

type Kind = OntologyMapNode["kind"];

function vault(): { nodes: OntologyMapNode[]; edges: OntologyMapEdge[] } {
  const nodes: OntologyMapNode[] = [];
  const edges: OntologyMapEdge[] = [];
  const node = (id: string, kind: Kind) => nodes.push({ id, label: id, kind, size: 1 } as OntologyMapNode);
  const contains = (source: string, target: string) =>
    edges.push({ id: `${source}>${target}`, source, target, kind: "contains", relationType: "contains" } as OntologyMapEdge);
  node("p", "project");
  for (let d = 0; d < 4; d += 1) {
    node(`d${d}`, "domain");
    contains("p", `d${d}`);
    for (let c = 0; c < 5; c += 1) {
      node(`d${d}c${c}`, "capability");
      contains(`d${d}`, `d${d}c${c}`);
      for (let e = 0; e < 3; e += 1) {
        node(`d${d}c${c}e${e}`, "element");
        contains(`d${d}c${c}`, `d${d}c${c}e${e}`);
      }
    }
  }
  node("loose", "capability");
  node("loose-e", "element");
  contains("loose", "loose-e");
  return { nodes, edges };
}

function host(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 1512, bottom: 900, width: 1512, height: 900, toJSON: () => ({}) });
  return canvas;
}

describe("predictCosmosMarks", () => {
  const { nodes, edges } = vault();

  it("lands one disc per concept at the overview camera's screen point, a domain at its galaxy's centre", () => {
    const canvas = host();
    const target = predictCosmosMarks({ nodes, edges, placement: null, host: canvas })!;
    expect(target.marks).toHaveLength(nodes.length);
    expect(target.ground).toBe("#05060a");
    const layout = cosmosLayoutFor(nodes, edges, null, false);
    const room = readHexRoom(canvas, 1512, 900);
    const { camera } = overviewCamera(layout.bounds, room);
    const centres = new Map(layout.galaxies.map((g) => [g.id, { x: g.x, y: g.y }]));
    expect(centres.size).toBe(4);
    for (const mark of target.marks) {
      const point = centres.get(mark.id) ?? layout.points.get(mark.id)!;
      const p = worldToScreen(camera, room, point.x, point.y);
      expect(mark.x).toBeCloseTo(p.x, 6);
      expect(mark.y).toBeCloseTo(p.y, 6);
    }
    expect(target.marks.find((m) => m.id === "d0c0")!.size).toBe(4);
    expect(target.marks.find((m) => m.id === "d0c0e0")!.size).toBe(2.4);
    expect(target.marks.find((m) => m.id === "d0")!.size).toBe(8);
    const halo = target.marks.find((m) => m.id === "loose")!.size;
    expect(halo).toBeGreaterThanOrEqual(1.2);
    expect(halo).toBeLessThanOrEqual(7);
  });

  it("shares the layout cache, so a second prediction lays out nothing", () => {
    const canvas = host();
    predictCosmosMarks({ nodes, edges, placement: null, host: canvas });
    const runs = cosmosLayoutRuns();
    predictCosmosMarks({ nodes, edges, placement: null, host: canvas });
    cosmosLayoutFor(nodes, edges, null, false);
    expect(cosmosLayoutRuns()).toBe(runs);
  });
});

describe("publishCosmosSnapshot", () => {
  const inks = { domain: "#111111", project: "#222222", capability: "#333333", element: "#444444", bgFar: "#000000" } as CosmosInks;
  const marks = [{ id: "d0", x: 10, y: 20, r: 30, kind: "domain" as const }];

  beforeEach(() => disarmMapLayoutMorph());

  it("publishes only while a morph is armed", () => {
    publishCosmosSnapshot({ marks, canvas: host(), inks });
    expect(takeMapLayoutMorph()).toBeNull();
    armMapLayoutMorph();
    publishCosmosSnapshot({ marks, canvas: host(), inks });
    const snapshot = takeMapLayoutMorph()!;
    expect(snapshot.ground).toBe("#000000");
    expect(snapshot.marks).toEqual([{ id: "d0", x: 10, y: 20, size: 30, shape: "disc", fill: "#111111", stroke: "#111111", alpha: 1 }]);
  });
});
