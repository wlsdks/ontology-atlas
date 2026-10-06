import { describe, expect, it, vi } from "vitest";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { relaxNodeSeparation } from "../model/separation";
import { collectActiveMotionIds, collectSeparationNodes, createWorldMotionFrameStage, type WorldMotionFrameStageSources } from "./topology-world-motion-frame-stage";
import type { WorldNode } from "./topology-world";
import { createForceSimulation } from "../model/force-layout";
import type { TopologyWorld } from "./topology-world";

const frame = vi.hoisted(() => ({ alphas: new Map<string, number>() }));
vi.mock("../dial/frame/frame", async original => ({
  ...await original<typeof import("../dial/frame/frame")>(),
  lastDialFrame: () => ({ alphas: frame.alphas }),
}));
vi.mock("./topology-world", async original => ({
  ...await original<typeof import("./topology-world")>(),
  recomputeWorldGeometry: vi.fn(),
}));

const tokens = { radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5 } as OntologyMapTokens;
const node = (id: string, x = 0): WorldNode => ({
  id, kind: "element", label: id, x, y: 0, homeX: x, homeY: 0,
  parentId: null, isHub: false, fresh: false, stale: false, count: 0, magnitudeScale: 1,
});

describe("separation of drawn map nodes", () => {
  it("leaves visible nodes alone when only an undisclosed dial node overlaps them", () => {
    const world = { nodes: [node("shown"), node("undisclosed")] };
    const { drawnIdx, sepNodes } = collectSeparationNodes(world, tokens, new Set(), new Map([["shown", 1]]));
    relaxNodeSeparation(sepNodes, { ratio: 1.35, iterations: 2 });
    expect(drawnIdx).toEqual([0]);
    expect(sepNodes).toEqual([{ id: "shown", x: 0, y: 0, r: 5 }]);
  });

  it("includes a newly disclosed node and keeps world indices for position writeback", () => {
    const world = { nodes: [node("folded"), node("faint", 1), node("shown", 2)] };
    const { drawnIdx, sepNodes } = collectSeparationNodes(world, tokens, new Set(["folded"]),
      new Map([["folded", 1], ["faint", 0.01], ["shown", 1]]));
    expect(drawnIdx).toEqual([1, 2]);
    expect(sepNodes.map(row => row.id)).toEqual(["faint", "shown"]);
  });

  it("retains classic separation when the dial does not own the frame", () => {
    const world = { nodes: [node("a"), node("b"), node("folded")] };
    const { drawnIdx, sepNodes } = collectSeparationNodes(world, tokens, new Set(["folded"]), null);
    relaxNodeSeparation(sepNodes, { ratio: 1.35, iterations: 2, pinnedId: "a" });
    expect(drawnIdx).toEqual([0, 1]);
    expect(sepNodes[0].x).toBe(0);
    expect(sepNodes[1].x).toBeGreaterThan(0);
  });

  it("omits zero-alpha nodes and handles an empty world", () => {
    expect(collectSeparationNodes({ nodes: [node("hidden")] }, tokens, new Set(), new Map([["hidden", 0]])).sepNodes).toEqual([]);
    expect(collectSeparationNodes({ nodes: [] }, tokens, new Set(), null)).toEqual({ drawnIdx: [], sepNodes: [] });
  });

  it("bounds collision inputs to the disclosed portion of a 3000-node world", () => {
    const nodes = Array.from({ length: 3000 }, (_, i) => node(`element:${i}`, i * 20));
    const alphas = new Map(nodes.slice(0, 19).map(row => [row.id, 1]));
    const { drawnIdx, sepNodes } = collectSeparationNodes({ nodes }, tokens, new Set(), alphas);
    expect(drawnIdx).toHaveLength(19);
    expect(sepNodes).toHaveLength(19);
  });

  it("keeps high-degree drag physics inside the drawn dial membership", () => {
    const ids = Array.from({ length: 10000 }, (_, i) => `element:${i}`);
    const alphas = new Map([[ids[0], 1], [ids[1], 0.01], [ids[2], 1], [ids[3], 0]]);
    expect([...collectActiveMotionIds(ids, new Set([ids[2]]), alphas, ids[0])]).toEqual([ids[0], ids[1]]);
    expect([...collectActiveMotionIds(ids.slice(0, 4), new Set([ids[2]]), null, ids[0])]).toEqual([ids[0], ids[1], ids[3]]);
  });

  it("keeps the dragged anchor active after it leaves the painted viewport", () => {
    expect([...collectActiveMotionIds(["pin", "neighbor", "hidden"], new Set(["pin"]),
      new Map([["pin", 0], ["neighbor", 1]]), "pin")]).toEqual(["pin", "neighbor"]);
    expect([...collectActiveMotionIds(["pin", "hidden"], new Set(), new Map(), "pin")]).toEqual(["pin"]);
  });

  it("writes the live pin back outside the viewport and when the pointer returns", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(i === 0 ? "held" : `hidden:${i}`, 500 + i * 100));
    const world = { nodes, nodeById: new Map(nodes.map(row => [row.id, row])), neighborMap: new Map(), dial: {} } as unknown as TopologyWorld;
    const sim = createForceSimulation(nodes, []);
    sim.pin("held", 600, 0);
    const ref = <T,>(current: T) => ({ current });
    const sources = {
      simRef: ref(sim), nodeDragRef: ref({ nodeId: "held" }), heatRef: ref(1000), homingActiveRef: ref(false),
      dragAffectedSetRef: ref({ draggedId: "held", oneHop: new Set(), twoHop: new Set() }),
      dragStartPosRef: ref({ x: 500, y: 0 }), dragTugOffsetsRef: ref(new Map()), dragVelRef: ref({ x: 0, y: 0 }),
      dragPrevPosRef: ref(null), dropSeededRef: ref(false), geomPrevXRef: ref(null), geomPrevYRef: ref(null),
      sepDisplacedIdsRef: ref(new Set()), homeSpringsRef: ref(new Map()), homeTargetOverrideRef: ref(null),
      prevPinnedNodeIdRef: ref("held"), clusteredIdsRef: ref(new Set()), expandedParentsRef: ref(new Set()),
      view3dRef: ref(false), domeRuntimeRef: ref(null), realmDataRef: ref(null), realmTransitionRef: ref({ phase: "idle" }),
      realmActiveHandedOffRef: ref(false), wardingFitRef: ref(null), reducedMotionRef: ref(false),
      overviewScaleRef: ref(1), overviewFitRef: ref("spine"),
    } as unknown as WorldMotionFrameStageSources;
    const step = createWorldMotionFrameStage(sources);
    frame.alphas = new Map([["held", 0]]);
    step(1000, 1 / 60, tokens, world, 500, 500);
    expect(world.nodeById.get("held")?.x).toBe(600);
    frame.alphas.clear();
    sim.movePin(300, 0);
    step(1016, 1 / 60, tokens, world, 500, 500);
    expect(world.nodeById.get("held")?.x).toBe(300);
    frame.alphas.set("held", 1);
    sim.movePin(450, 0);
    step(1032, 1 / 60, tokens, world, 500, 500);
    expect(world.nodeById.get("held")?.x).toBe(450);
  });
});
