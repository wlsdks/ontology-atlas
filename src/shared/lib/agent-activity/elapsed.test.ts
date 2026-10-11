import { describe, expect, it } from "vitest";

import { elapsedParts } from "./elapsed";

describe("elapsedParts", () => {
  it("splits a duration and never goes negative", () => {
    expect(elapsedParts(0)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(elapsedParts(72_400)).toEqual({ hours: 0, minutes: 1, seconds: 12 });
    expect(elapsedParts(3_725_000)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(elapsedParts(-5_000)).toEqual({ hours: 0, minutes: 0, seconds: 0 });
  });
});
