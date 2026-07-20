import { describe, expect, it } from "vitest";
import { findFreeSpawnPosition, type SpawnBox } from "./find-free-spawn-position";

const SIZE = { width: 196, height: 56 };

function overlaps(a: SpawnBox, b: SpawnBox, padding = 0): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

describe("findFreeSpawnPosition", () => {
  it("returns the center itself when nothing occupies it", () => {
    const pos = findFreeSpawnPosition({ boxes: [], center: { x: 240, y: 160 } });
    expect(pos).toEqual({ x: 240, y: 160 });
  });

  it("does not overlap an existing node sitting exactly at the center (B-2 regression)", () => {
    // "Vault — Local-First" occupies the spawn center; new node must dodge it.
    const occupied: SpawnBox = { x: 240, y: 160, width: 220, height: 64 };
    const pos = findFreeSpawnPosition({
      boxes: [occupied],
      center: { x: 240, y: 160 },
      size: SIZE,
    });
    expect(
      overlaps({ ...pos, ...SIZE }, occupied, 24),
    ).toBe(false);
  });

  it("finds a free spot amid a cluster of nodes without overlapping any", () => {
    const boxes: SpawnBox[] = [];
    for (let gx = 0; gx < 3; gx += 1) {
      for (let gy = 0; gy < 3; gy += 1) {
        boxes.push({ x: 100 + gx * 120, y: 100 + gy * 90, width: 100, height: 60 });
      }
    }
    const pos = findFreeSpawnPosition({
      boxes,
      center: { x: 220, y: 190 },
      size: SIZE,
    });
    const placed: SpawnBox = { ...pos, ...SIZE };
    expect(boxes.every((b) => !overlaps(placed, b, 8))).toBe(true);
  });
});
