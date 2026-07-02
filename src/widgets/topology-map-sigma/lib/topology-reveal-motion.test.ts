import { describe, expect, it } from "vitest";
import {
  TOPOLOGY_INITIAL_REVEAL_DURATION_MS,
  TOPOLOGY_INITIAL_REVEAL_MOTION_CONTRACT,
  TOPOLOGY_INITIAL_REVEAL_TRANSFORM_POLICY,
  topologyInitialRevealTransition,
} from "./topology-reveal-motion";

describe("topology initial reveal motion", () => {
  it("keeps loading reveal fast and opacity-only", () => {
    expect(TOPOLOGY_INITIAL_REVEAL_MOTION_CONTRACT).toBe(
      "opacity-only-fast-ready-reveal",
    );
    expect(TOPOLOGY_INITIAL_REVEAL_DURATION_MS).toBeLessThanOrEqual(220);
    expect(TOPOLOGY_INITIAL_REVEAL_TRANSFORM_POLICY).toBe(
      "no-scale-during-initial-load",
    );
    expect(topologyInitialRevealTransition()).toBe("opacity 180ms ease-out");
    expect(topologyInitialRevealTransition()).not.toContain("transform");
    expect(topologyInitialRevealTransition()).not.toContain("700ms");
  });
});
