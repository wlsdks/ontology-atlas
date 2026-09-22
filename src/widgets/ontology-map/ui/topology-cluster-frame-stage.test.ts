import { describe, expect, it } from "vitest";

import { clusterBatchShownCount } from "./topology-cluster-frame-stage";

describe("clusterBatchShownCount", () => {
  it("lets expand-all reveal every ranked child instead of leaving a remainder chip", () => {
    expect(clusterBatchShownCount(26, "full", 1, 24)).toBe(26);
    expect(clusterBatchShownCount(53, "full", 2, 24)).toBe(53);
  });

  it("keeps ordinary spine expansion bounded by the revealed batch count", () => {
    expect(clusterBatchShownCount(26, "spine", undefined, 24)).toBe(24);
    expect(clusterBatchShownCount(53, "spine", 2, 24)).toBe(48);
  });
});
