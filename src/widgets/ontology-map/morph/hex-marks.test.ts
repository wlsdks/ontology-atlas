import { describe, expect, it } from "vitest";
import { roomMovesRest } from "./hex-marks";

const room = { x: 100, y: 100, width: 800, height: 600 };

describe("roomMovesRest", () => {
  it("takes the first reading", () => {
    expect(roomMovesRest(null, room)).toBe(true);
  });

  it("keeps the room when every edge moves 12 px or less", () => {
    expect(roomMovesRest(room, { x: 112, y: 88, width: 800, height: 624 })).toBe(false);
  });

  it("moves the room when one edge moves 13 px", () => {
    expect(roomMovesRest(room, { ...room, width: 813 })).toBe(true);
  });
});
