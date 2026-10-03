import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraAxes } from "../engine/camera";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { buildTopologyWorld } from "../ui/topology-world";
import type { DialLightFrame } from "../dial/types";
import { LIGHT_SOURCES, type LightEmitter, type LightHead, type LightSourceInput } from "./light-sources";

const dial = vi.hoisted(() => ({ frame: null as DialLightFrame | null }));
vi.mock("../dial/frame/frame", () => ({ dialLightFrame: () => dial.frame }));

const TOKENS = {
  radiusProject: 20, radiusDomain: 14, radiusCapability: 8, radiusElement: 5,
  layoutRingDomain: 250, layoutRingCapability: 145, layoutRingElement: 90,
  edgeBowContains: 70, edgeBowDepends: 92, edgeBlendContains: 0.46, edgeBlendDepends: 0.62,
  starCount: 2, radiusMagnitudeK: 0, lightCorePx: 1.6, lightHaloPx: 6,
} as unknown as OntologyMapTokens;
const CAMERA: CameraAxes = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 }, scale: { value: 1, velocity: 0 } };
const KINEMATICS = { speed: 1100, hopMinMs: 180, hopMaxMs: 420, pathMaxMs: 1200, tail: 0.35, intensity: 0.9, bloomTauMs: 280 };

const node = (id: string, kind: OntologyMapNode["kind"]): OntologyMapNode => ({
  id, kind, label: id, size: 1, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, fullDegree: 0, descendantCount: 0,
});
const edge = (source: string, target: string, kind: "contains" | "depends", id: string): OntologyMapEdge => ({
  id, source, target, relationType: kind === "contains" ? "contains" : "depends_on", relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null,
});
const WORLD = buildTopologyWorld(
  [node("p", "project"), node("d0", "domain"), node("c0", "capability"), node("e0", "element"), node("e1", "element")],
  [edge("p", "d0", "contains", "x0"), edge("d0", "c0", "contains", "x1"), edge("c0", "e0", "contains", "x2"), edge("c0", "e1", "contains", "x3"), edge("e0", "e1", "depends", "x4")],
  TOKENS,
);

function input(now: number, focusedNodeId: string | null): LightSourceInput {
  return {
    now, world: WORLD, camera: CAMERA, width: 800, height: 600, tokens: TOKENS, kinematics: KINEMATICS, focusedNodeId,
    trailLensActive: false, reducedMotion: false, revealProgress: 1, clusteredIds: new Set(),
    mapLensKind: null as unknown as LightSourceInput["mapLensKind"], pathEdgeIds: null, pathNodeIds: null,
  };
}

function emitter() {
  const heads: LightHead[] = [];
  const out: LightEmitter = { wantsHeads: true, signal() {}, bloom() {}, signalled() {}, head: (head) => heads.push(head) };
  return { out, heads };
}

const DIAL_PAINTED: DialLightFrame = { attentionKey: "d0||1", focused: true, inkMix: 1, chords: [] };

describe("focus light", () => {
  beforeEach(() => {
    dial.frame = null;
  });

  it("keeps the plan of an element picked from the dial and plays it on the first classic frame", () => {
    const focus = LIGHT_SOURCES[0]!();
    focus.step(input(0, null), emitter().out);
    dial.frame = DIAL_PAINTED;
    const skipped = emitter();
    expect(focus.step(input(16, "e0"), skipped.out)).toBe(false);
    expect(skipped.heads).toEqual([]);
    expect(focus.plan()).toBeNull();
    dial.frame = null;
    const classic = emitter();
    expect(focus.step(input(32, "e0"), classic.out)).toBe(true);
    expect(focus.plan()?.anchorId).toBe("e0");
    expect(focus.plan()?.createdMs).toBe(16);
    expect(classic.heads.map((h) => h.key).sort()).toEqual(["x2", "x4"]);
  });

  it("neither keeps the loop awake nor reports a plan while the dial owns the paint", () => {
    const focus = LIGHT_SOURCES[0]!();
    focus.step(input(0, null), emitter().out);
    dial.frame = DIAL_PAINTED;
    for (let now = 16; now < 2000; now += 16) {
      expect(focus.step(input(now, "d0"), emitter().out)).toBe(false);
      expect(focus.plan()).toBeNull();
    }
  });
});
