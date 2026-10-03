import { describe, expect, it } from "vitest";
import type { CosmosInks, CosmosLabelKind, CosmosRoom, LabelCandidate } from "../cosmos-types";
import { CosmosBitmapCache } from "./cosmos-bitmap-cache";
import { placeCosmosLabels } from "./cosmos-labels";

const ctx = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "measureText") return (text: string) => ({ width: text.length * 6 });
      return () => {};
    },
    set: () => true,
  },
) as unknown as CanvasRenderingContext2D;

const inks = { bgNear: "#000000", labelMeta: "#ffffff" } as CosmosInks;
const room: CosmosRoom = { x: 100, y: 50, width: 4000, height: 4000 };

const candidate = (kind: CosmosLabelKind, i: number, priority: number, extra: Partial<LabelCandidate> = {}): LabelCandidate => ({
  text: `${kind}${i}`, kind, id: `${kind}-${i}`, x: 200 + (i % 20) * 180, y: 100 + Math.floor(i / 20) * 40 + priority / 1000, align: "left", font: "11px sans", ink: "#fff", priority, ...extra,
});

const place = (candidates: LabelCandidate[], r = room) =>
  placeCosmosLabels(ctx, candidates, { room: r, cache: new CosmosBitmapCache(), inks, metaFont: "10px sans", labelOf: (id) => `name of ${id}` });

describe("placeCosmosLabels", () => {
  it("places in priority order", () => {
    const placed = place([candidate("cluster", 0, 300), candidate("galaxy", 1, 900), candidate("project", 2, 1000)]);
    expect(placed.map((l) => l.kind)).toEqual(["project", "galaxy", "cluster"]);
  });

  it("keeps a higher priority label when two collide", () => {
    const placed = place([candidate("element", 0, 100, { x: 500, y: 500 }), candidate("cluster", 0, 400, { x: 500, y: 500 })]);
    expect(placed.map((l) => l.kind)).toEqual(["cluster"]);
  });

  it("caps clusters at 48 and elements at 40", () => {
    const many: LabelCandidate[] = [];
    for (let i = 0; i < 60; i += 1) many.push(candidate("cluster", i, 300));
    for (let i = 60; i < 120; i += 1) many.push(candidate("element", i, 100));
    const placed = place(many);
    expect(placed.filter((l) => l.kind === "cluster").length).toBe(48);
    expect(placed.filter((l) => l.kind === "element").length).toBe(40);
  });

  it("does not place a candidate outside the room", () => {
    const placed = place([candidate("cluster", 0, 300, { x: 20, y: 20 }), candidate("element", 1, 100, { x: room.x + room.width - 5, y: 200 })]);
    expect(placed).toEqual([]);
  });

  it("moves a domain name inside the room and off another name", () => {
    const small: CosmosRoom = { x: 0, y: 0, width: 400, height: 300 };
    const placed = place([candidate("galaxy", 0, 950, { x: 200, y: 295, align: "center" }), candidate("galaxy", 1, 940, { x: 200, y: 295, align: "center" })], small);
    expect(placed.length).toBe(2);
    for (const l of placed) {
      expect(l.y + l.height).toBeLessThanOrEqual(small.height);
      expect(l.y).toBeGreaterThanOrEqual(0);
    }
    expect(placed[0]!.y + placed[0]!.height <= placed[1]!.y || placed[1]!.y + placed[1]!.height <= placed[0]!.y).toBe(true);
  });

  it("drops a domain name whose galaxy lies outside the room instead of pulling it in", () => {
    const small: CosmosRoom = { x: 0, y: 0, width: 400, height: 300 };
    const placed = place([candidate("galaxy", 0, 950, { x: 700, y: 150, align: "center" }), candidate("project", 1, 1000, { x: 200, y: 600, align: "center" })], small);
    expect(placed).toEqual([]);
  });

  it("keeps a crowded domain name within 100 px of its anchor or drops it", () => {
    const small: CosmosRoom = { x: 0, y: 0, width: 400, height: 300 };
    const crowd = Array.from({ length: 12 }, (_, i) => candidate("galaxy", i, 950 - i, { x: 200, y: 150, align: "center" }));
    const placed = place(crowd, small);
    expect(placed.length).toBeLessThan(12);
    for (const l of placed) expect(Math.abs(l.y + l.height / 2 - 150)).toBeLessThanOrEqual(100);
  });

  it("names element and member labels by id", () => {
    const placed = place([candidate("member", 0, 500, { text: "" }), candidate("element", 1, 100, { text: "" })]);
    expect(placed.map((l) => l.text)).toEqual(["name of member-0", "name of element-1"]);
  });
});
