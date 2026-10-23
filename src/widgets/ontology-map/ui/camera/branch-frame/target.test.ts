import { describe, expect, it } from "vitest";
import type { DialScene, DialWorld } from "../../../dial/types";
import { applyBranchMemberAction } from "../../../dial/branches/member-disclosure";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import type { TopologyWorld } from "../../world/topology-world";
import { branchFocusTarget } from "./target";

const tokens = { radiusDomain: 14, radiusCapability: 8, cameraScaleMin: 0.24, cameraScaleMax: 2.6,
  safeInsetLeft: 100, safeInsetRight: 350, safeInsetTop: 100, safeInsetBottom: 80 } as OntologyMapTokens;
function fixture() {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, direct: false, x: i === 6 ? 800 : 150, y: i * 60 }));
  const cluster = { domainId: "d", items };
  const scene = { branches: true, branchPreviewRows: 6, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) } as unknown as DialScene;
  const dial = { scene, overviewPadPx: { left: 120, right: 120, top: 12, bottom: 12 } } as DialWorld;
  const world = { nodeById: new Map([{ id: "d", x: 0, y: 0 }, ...items].map(p => [p.id, p])) } as unknown as TopologyWorld;
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
    expect(x).toBeLessThanOrEqual(1400 - tokens.safeInsetRight - dial.overviewPadPx.right);
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
