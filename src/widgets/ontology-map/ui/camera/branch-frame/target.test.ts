import { describe, expect, it, vi } from "vitest";
import type { DialScene, DialWorld } from "../../../dial/types";
import { applyBranchMemberAction } from "../../../dial/branches/member-disclosure";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import type { TopologyWorld } from "../../world/topology-world";
import { branchFocusTarget } from "./target";

vi.mock("../../../dial/tokens", () => ({ readDialTokens: () => ({ nameMaxPx: 160, ledgerGapPx: 24, chipMinPx: 8, discGlyphPx: 7.5, labelScale: 1, pitch: 34, capName: 22 }) }));
vi.mock("../../../dial/fit", () => ({ createMeasureText: () => (text: string) => text.length * 7 }));

const tokens = { radiusDomain: 14, radiusCapability: 8, cameraScaleMin: 0.24, cameraScaleMax: 2.6,
  safeInsetLeft: 100, safeInsetRight: 350, safeInsetTop: 100, safeInsetBottom: 80 } as OntologyMapTokens;
function fixture() {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, direct: false, x: i === 6 ? 800 : 150, y: i * 60 }));
  const cluster = { domainId: "d", items };
  const scene = { branches: true, branchPreviewRows: 6, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) } as unknown as DialScene;
  const dial = { scene, overviewPadPx: { left: 120, right: 120, top: 12, bottom: 12 } } as DialWorld;
  const world = { nodeById: new Map([{ id: "d", x: 0, y: 0 }, ...items].map(p => [p.id, { ...p }])) } as unknown as TopologyWorld;
  return { dial, world };
}
describe("disclosed branch framing", () => {
  it("fits the newly disclosed member and restores the compact frame on collapse", () => {
    const { dial, world } = fixture();
    const before = branchFocusTarget(world, dial, "d", tokens, 1400, 900)!;
    applyBranchMemberAction(dial.scene, { type: "branch-members", domainId: "d", direction: "more" }, 0);
    const after = branchFocusTarget(world, dial, "d", tokens, 1400, 900)!;
    expect(after.tscale).toBeLessThan(before.tscale);
    const far = world.nodeById.get("c6")!;
    const x = (far.x - after.tx) * after.tscale + 700;
    expect(x).toBeLessThanOrEqual(1400 - tokens.safeInsetRight - 64);
    applyBranchMemberAction(dial.scene, { type: "branch-members", domainId: "d", direction: "less" }, 200);
    expect(branchFocusTarget(world, dial, "d", tokens, 1400, 900)).toEqual(before);
  });
  it("uses live dragged positions and leaves non-domain focus to its existing camera", () => {
    const { dial, world } = fixture();
    const before = branchFocusTarget(world, dial, "d", tokens, 1400, 900)!;
    world.nodeById.get("c0")!.x = 900;
    expect(branchFocusTarget(world, dial, "d", tokens, 1400, 900)!.tscale).toBeLessThan(before.tscale);
    expect(branchFocusTarget(world, dial, "c0", tokens, 1400, 900)).toBeNull();
  });
});

it("keeps successive member columns readable without reserving an absent INDEX", () => {
  const { dial, world } = fixture();
  const cluster = dial.scene.clusters[0]!;
  cluster.items.splice(0, cluster.items.length,
    { id: "a", direct: false, x: -272, y: -34 } as never,
    { id: "b", direct: false, x: -544, y: -34 } as never);
  dial.scene.branchPreviewRows = 1;
  cluster.branchSide = -1;
  world.nodeById = new Map([...world.nodeById, ...cluster.items.map(item => [item.id, { ...item, label: "Capability 109" } as never] as const)]);
  dial.overviewPadPx = { left: 200, right: 200, top: 24, bottom: 24 };
  applyBranchMemberAction(dial.scene, { type: "branch-members", domainId: "d", direction: "more" }, 0);
  const fit = branchFocusTarget(world, dial, "d", { ...tokens, safeInsetLeft: 376, safeInsetRight: 120, obstacleInsetLeft: 0, obstacleInsetRight: 60 } as OntologyMapTokens, 976, 720)!;
  expect(272 * fit.tscale, "a disclosed name has room before the adjacent member glyph").toBeGreaterThan(130);
});

it("keeps the scene-anchored collapse control visible after dragging the last member away", () => {
  const { dial, world } = fixture();
  applyBranchMemberAction(dial.scene, { type: "branch-members", domainId: "d", direction: "more" }, 0);
  const node = world.nodeById.get("c6")!;
  node.x = -800; node.y = -800;
  const target = branchFocusTarget(world, dial, "d", tokens, 1400, 900)!;
  const action = dial.scene.clusters[0]!.items.at(-1)!;
  const x = (action.x - target.tx) * target.tscale + 700;
  expect(x, "the control retains its scene position when the node moves").toBeLessThan(1400 - tokens.safeInsetRight);
});

it("reserves readable selected capability space between two panels", () => {
  const { dial, world } = fixture();
  dial.model = { capabilityById: new Map([["c0", { domainId: "d" }]]) } as never;
  const selected = world.nodeById.get("c0")!;
  selected.label = "Selected capability";
  expect(branchFocusTarget(world, dial, "c0", tokens, 976, 720), "unscoped capability selection retains related-endpoint framing").toBeNull();
  const target = branchFocusTarget(world, dial, "c0", { ...tokens, obstacleInsetLeft: 322, obstacleInsetRight: 374 } as OntologyMapTokens, 976, 720, { scopedCapability: true });
  expect(target).not.toBeNull();
  const x = (selected.x - target!.tx) * target!.tscale + 488;
  expect(target!.tscale).toBeGreaterThanOrEqual(0.6);
  expect(x + 7.5 + 8 + "Selected capability".length * 7 + 2).toBeLessThanOrEqual(976 - 374 - 24);
});

it("frames planned realm positions instead of the departing overview coordinates", () => {
  const { dial, world } = fixture();
  const expected = branchFocusTarget(world, dial, "d", tokens, 1400, 900)!;
  const planned = new Map([...world.nodeById].map(([id, point]) => [id, { x: point.x, y: point.y }]));
  for (const node of world.nodeById.values()) { node.x += 2400; node.y -= 900; }
  expect(branchFocusTarget(world, dial, "d", tokens, 1400, 900, { positions: planned })).toEqual(expected);
});
