import { describe, expect, it } from "vitest";
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
} from "./url-state";

describe("parseHomeRouteState", () => {
  it("reads supported home query params", () => {
    const params = new URLSearchParams(
      "p=iam&c=in-progress&hub=iam&impact=downstream&pulse=30d",
    );

    expect(parseHomeRouteState(params)).toEqual({
      selectedSlug: "iam",
      activeCategory: "in-progress",
      focusedHubSlug: "iam",
      impactMode: "downstream",
      pulseMode: "30d",
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
      impactMode: "network",
      pulseMode: "7d",
    });

    expect(params.toString()).toBe(
      "p=pick&c=planned&hub=reactor&impact=network&pulse=7d",
    );
  });

  it("drops params when values match defaults", () => {
    const params = applyHomeRouteState(
      new URLSearchParams("p=pick&impact=network&pulse=7d"),
      DEFAULT_HOME_ROUTE_STATE,
    );

    expect(params.toString()).toBe("");
  });
});
