import { describe, expect, it } from "vitest";

import { HIT_TOUCH_SLACK_PX } from "../ui/topology-camera-math";
import { pickDial } from "./pick";
import type { DialPick, DialRowPick } from "./types";

const disc = (id: string, x: number, y: number, r: number): DialPick => ({ id, x, y, r });
const row = (id: string, minX: number, minY: number, maxX: number, maxY: number): DialRowPick => ({ id, box: { minX, minY, maxX, maxY } });

describe("pickDial", () => {
  it("lets a row beat a disc under the same point", () => {
    expect(pickDial([disc("cap", 10, 10, 6)], [row("ledger-cap", 5, 5, 40, 15)], 10, 10, HIT_TOUCH_SLACK_PX)).toBe("ledger-cap");
  });

  it("lets the later-painted ink win where inks overlap, in the dial's paint order", () => {
    const picks = [disc("cap", 30, 0, 8), disc("element", 40, 0, 3), disc("hub", 0, 0, 20), disc("chip", 26, 0, 8), disc("focused", 34, 0, 6)];
    expect(pickDial(picks, [], 22, 0, HIT_TOUCH_SLACK_PX)).toBe("chip");
    expect(pickDial(picks, [], 19, 0, HIT_TOUCH_SLACK_PX)).toBe("chip");
    expect(pickDial(picks, [], 10, 0, HIT_TOUCH_SLACK_PX)).toBe("hub");
    expect(pickDial(picks, [], 35, 0, HIT_TOUCH_SLACK_PX)).toBe("focused");
    expect(pickDial(picks, [], 39, 0, HIT_TOUCH_SLACK_PX)).toBe("focused");
    expect(pickDial(picks, [], 42, 0, HIT_TOUCH_SLACK_PX)).toBe("element");
    expect(pickDial(picks, [], 31, 7.8, HIT_TOUCH_SLACK_PX)).toBe("cap");
  });

  it("counts slack only when no ink is under the point", () => {
    const picks = [disc("big", 0, 0, 10), disc("small", 14, 0, 2)];
    expect(pickDial(picks, [], 9, 0, HIT_TOUCH_SLACK_PX)).toBe("big");
    expect(pickDial(picks, [], 11, 0, HIT_TOUCH_SLACK_PX)).toBe("small");
  });

  it("lets the nearest slack win, not the later paint", () => {
    const picks = [disc("near", 0, 0, 3), disc("far", 12, 0, 3)];
    expect(pickDial(picks, [], 4, 0, HIT_TOUCH_SLACK_PX)).toBe("near");
    expect(pickDial(picks, [], 8, 0, HIT_TOUCH_SLACK_PX)).toBe("far");
  });

  it("returns null outside every disc, slack ring and row", () => {
    expect(pickDial([disc("cap", 0, 0, 4)], [row("r", 50, 50, 60, 60)], 30, 30, HIT_TOUCH_SLACK_PX)).toBeNull();
    expect(pickDial([], [], 0, 0, HIT_TOUCH_SLACK_PX)).toBeNull();
  });
});
