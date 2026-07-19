import { describe, expect, it } from "vitest";
import { decideChangeAnnouncement } from "./change-announcement";

describe("decideChangeAnnouncement", () => {
  it("never announces on the very first observation (baseline capture)", () => {
    expect(decideChangeAnnouncement(null, 0)).toEqual({ show: false, delta: 0 });
    expect(decideChangeAnnouncement(null, 5)).toEqual({ show: false, delta: 0 });
  });

  it("announces when the count grows past a previously observed value", () => {
    expect(decideChangeAnnouncement(2, 5)).toEqual({ show: true, delta: 3 });
  });

  it("announces a delta of 1 for a single newly touched node", () => {
    expect(decideChangeAnnouncement(0, 1)).toEqual({ show: true, delta: 1 });
  });

  it("stays silent when the count is unchanged", () => {
    expect(decideChangeAnnouncement(4, 4)).toEqual({ show: false, delta: 0 });
  });

  it("stays silent when the count drops (e.g. baseline advanced by a review)", () => {
    expect(decideChangeAnnouncement(6, 2)).toEqual({ show: false, delta: 0 });
  });
});
