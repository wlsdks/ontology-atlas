import { afterEach, describe, expect, it } from "vitest";
import { readHexRoom, roomMovesRest } from "./hex-marks";

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

function placed<T extends HTMLElement>(el: T, x: number, y: number, width: number, height: number): T {
  el.getBoundingClientRect = () => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });
  document.body.append(el);
  return el;
}

describe("readHexRoom", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("lets only a control beside the room push its left edge, not one under its floor", () => {
    const canvas = placed(document.createElement("canvas"), 64, 0, 976, 720);
    placed(document.createElement("div"), 88, 24, 300, 672);
    const hint = placed(document.createElement("div"), 378, 658, 349, 30);
    expect(readHexRoom(canvas, 976, 720)).toEqual({ x: 340, y: 96, width: 564, height: 504 });
    hint.getBoundingClientRect = () => ({ x: 378, y: 300, left: 378, top: 300, right: 727, bottom: 330, width: 349, height: 30, toJSON: () => ({}) });
    expect(readHexRoom(canvas, 976, 720).x).toBe(679);
  });

  it("keeps the predicted room when the destination footer occupies its bottom reserve", () => {
    const canvas = placed(document.createElement("canvas"), 64, 0, 1448, 982);
    placed(document.createElement("div"), 412, 24, 1076, 140);
    const predicted = readHexRoom(canvas, 1448, 982);
    placed(document.createElement("div"), 488, 868, 960, 98);
    expect(readHexRoom(canvas, 1448, 982)).toEqual(predicted);
  });
});
