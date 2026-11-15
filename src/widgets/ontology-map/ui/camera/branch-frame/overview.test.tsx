import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RealmRuntimeData } from "../../world/topology-realm-runtime";
import type { TopologyWorld } from "../../world/topology-world";
import { useTopologyOverviewNavigation } from "../use-topology-overview-navigation";

const tokens = vi.hoisted(() => ({ radiusCapability: 11, cameraScaleMin: 0.24, cameraScaleMax: 2.6,
  safeInsetLeft: 376, safeInsetRight: 120, safeInsetTop: 164, safeInsetBottom: 72,
  cameraDampingDefault: 1, cameraSpringAngFreqTransition: 4.7 }));
vi.mock("../../../tokens/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => tokens }));
vi.mock("../../../dial/tokens", () => ({ readDialTokens: () => ({ nameMaxPx: 160, ledgerGapPx: 24, chipMinPx: 8, discGlyphPx: 7.5, labelScale: 1, pitch: 34, capName: 22 }) }));
vi.mock("../../../dial/fit", async original => ({ ...await original<typeof import("../../../dial/fit")>(), createMeasureText: () => (text: string) => text.length * 7 }));
const ref = <T,>(current: T) => ({ current });

function fixture(phase: "entering" | "active") {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, direct: false, x: i < 6 ? 136 : 408, y: (i % 6 - 3) * 68 }));
  const cluster = { domainId: "d", branchSide: 1, items };
  const insideTargets = new Map([{ id: "d", x: -136, y: 0 }, ...items].map(n => [n.id, { x: n.x, y: n.y }]));
  const nodes = [...insideTargets].map(([id, point]) => ({ id, label: id === "d" ? "Orders" : `Capability ${id}`, ...point, x: point.x + (phase === "entering" ? 2400 : 0) }));
  const world = { nodes, nodeById: new Map(nodes.map(n => [n.id, n])) } as unknown as TopologyWorld;
  const realm = { flat: true, rootId: "d", insideTargets, bounds: { minX: -170, maxX: 442, minY: -238, maxY: 170 },
    dial: { scene: { branches: true, branchPreviewRows: 6, clusters: [cluster], clusterByDomain: new Map([["d", cluster]]) },
      overviewPadPx: { left: 264, right: 264, top: 24, bottom: 24 } },
  } as unknown as RealmRuntimeData;
  const cameraTargetRef = ref({ tx: 0, ty: 0, tscale: 0.4 });
  const beginCameraTween = vi.fn();
  const deps = {
    worldRef: ref(world), viewportRef: ref({ width: 976, height: 720, dpr: 1 }), hasInitializedRef: ref(true),
    realmDataRef: ref(realm), realmTransitionRef: ref({ phase }), expandedParentsRef: ref(new Set()),
    cameraTargetRef, userDrivenCameraRef: ref(false), dampingRef: ref(1), cameraAngularFreqRef: ref(null),
    beginCameraTween, domeRuntimeRef: ref(null), domeFitTarget: vi.fn(), lastActiveMsRef: ref(0),
    overviewFitRef: ref("spine"), spotlightIdsRef: ref(null), runSpotlightFitRef: ref(null), clusteredIdsRef: ref(new Set()),
    cameraTokens: <T,>(t: T) => ({ ...t, safeInsetLeft: 324, safeInsetRight: 120, obstacleInsetLeft: 324, obstacleInsetRight: 60 }),
    overviewScaleRef: ref(0.4),
  } as unknown as Parameters<typeof useTopologyOverviewNavigation>[0];
  const hook = renderHook(() => useTopologyOverviewNavigation(deps));
  return { ...deps, hook, insideTargets, world };
}

describe("scoped overview fitting", () => {
  it.each(["entering", "active"] as const)("keeps disclosed rows readable when INDEX restores during %s", phase => {
    const f = fixture(phase);
    f.hook.result.current.runOverviewFit();
    const target = f.cameraTargetRef.current;
    expect(68 * target.tscale, "row spacing stays above the branch detail threshold").toBeGreaterThan(24);
    for (const id of ["d", "c0", "c5"]) {
      const point = f.insideTargets.get(id)!;
      const x = (point.x - target.tx) * target.tscale + 488;
      expect(x, `${id} clears INDEX`).toBeGreaterThan(324);
      expect(x, `${id} clears the utility rail`).toBeLessThan(916);
    }
    expect(f.beginCameraTween).toHaveBeenCalledWith(target);
  });
});
