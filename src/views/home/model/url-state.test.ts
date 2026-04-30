import { describe, expect, it } from "vitest";
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
} from "./url-state";

describe("parseHomeRouteState", () => {
  it("reads supported home query params", () => {
    const params = new URLSearchParams(
      "p=iam&c=in-progress&hub=iam&path=identity&impact=downstream&pulse=30d&pj=narnia",
    );

    expect(parseHomeRouteState(params)).toEqual({
      selectedSlug: "iam",
      activeCategory: "in-progress",
      focusedHubSlug: "iam",
      featuredPathId: "identity",
      impactMode: "downstream",
      pulseMode: "30d",
      projectId: "narnia",
    });
  });

  it("falls back when unknown values are provided", () => {
    const params = new URLSearchParams("impact=weird&pulse=bad");

    expect(parseHomeRouteState(params)).toEqual(DEFAULT_HOME_ROUTE_STATE);
  });
});

describe("applyHomeRouteState", () => {
  it("serializes non-default values", () => {
    const params = applyHomeRouteState(new URLSearchParams(), {
      selectedSlug: "pick",
      activeCategory: "planned",
      focusedHubSlug: "reactor",
      featuredPathId: "agent",
      impactMode: "network",
      pulseMode: "7d",
      projectId: "narnia",
    });

    expect(params.toString()).toBe(
      "p=pick&c=planned&hub=reactor&path=agent&impact=network&pulse=7d&pj=narnia",
    );
  });

  it("drops params when values match defaults", () => {
    const params = applyHomeRouteState(
      new URLSearchParams("p=pick&impact=network&pulse=7d&pj=foo"),
      DEFAULT_HOME_ROUTE_STATE,
    );

    expect(params.toString()).toBe("");
  });
});
