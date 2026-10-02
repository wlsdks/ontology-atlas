import { describe, expect, it } from "vitest";

import { COSMOS_BITMAP_CAP_BYTES, CosmosBitmapCache } from "./cosmos-bitmap-cache";

const bitmap = (size: number) => ({ width: size, height: size }) as HTMLCanvasElement;

describe("CosmosBitmapCache", () => {
  it("caps baked bitmaps at 48 MiB", () => {
    expect(COSMOS_BITMAP_CAP_BYTES).toBe(48 * 1024 * 1024);
    const cache = new CosmosBitmapCache();
    for (let i = 0; i < 200; i += 1) {
      cache.setImpostor(`g${i}`, 512, bitmap(512));
      cache.setGlow(`g${i}`, 512, { base: bitmap(512), wisps: bitmap(512) });
      expect(cache.bytes()).toBeLessThanOrEqual(COSMOS_BITMAP_CAP_BYTES);
    }
    expect(cache.impostor(`g${199}`, 512)).toBeDefined();
    expect(cache.impostor(`g${0}`, 512)).toBeUndefined();
  });

  it("evicts the least recently drawn bitmap first", () => {
    const cap = 3 * 64 * 64 * 4;
    const cache = new CosmosBitmapCache(cap);
    cache.setImpostor(`g${0}`, 64, bitmap(64));
    cache.setImpostor(`g${1}`, 64, bitmap(64));
    cache.setImpostor(`g${2}`, 64, bitmap(64));
    cache.impostor(`g${0}`, 64);
    cache.setImpostor(`g${3}`, 64, bitmap(64));
    expect(cache.impostor(`g${1}`, 64)).toBeUndefined();
    expect(cache.impostor(`g${0}`, 64)).toBeDefined();
    expect(cache.impostor(`g${2}`, 64)).toBeDefined();
    expect(cache.impostor(`g${3}`, 64)).toBeDefined();
    expect(cache.bytes()).toBe(cap);
  });

  it("counts a replaced bitmap once", () => {
    const cache = new CosmosBitmapCache();
    cache.setCore(128, bitmap(128));
    cache.setCore(128, bitmap(64));
    expect(cache.bytes()).toBe(64 * 64 * 4);
  });

  it("empties on clear", () => {
    const cache = new CosmosBitmapCache();
    cache.setImpostor(`g${0}`, 256, bitmap(256));
    cache.setCore(64, bitmap(64));
    cache.clear();
    expect(cache.bytes()).toBe(0);
    expect(cache.impostor(`g${0}`, 256)).toBeUndefined();
  });

  it("keeps the bitmaps of galaxies that are still drawn and drops the rest", () => {
    const cache = new CosmosBitmapCache();
    cache.setImpostor("a:1", 64, bitmap(64));
    cache.setGlow("b", 256, { base: bitmap(256), wisps: bitmap(256) });
    cache.setCore(64, bitmap(64));
    cache.retain(new Set(["a:1"]));
    expect(cache.impostor("a:1", 64)).toBeDefined();
    expect(cache.glow("b", 256)).toBeUndefined();
    expect(cache.bytes()).toBe(2 * 64 * 64 * 4);
  });

  it("reports a first draw once per bake", () => {
    const cache = new CosmosBitmapCache();
    cache.setImpostor(`g${4}`, 128, bitmap(128));
    expect(cache.markDrawn("impostor:g4:128", 1)).toBe(true);
    expect(cache.markDrawn("impostor:g4:128", 2)).toBe(false);
    cache.setImpostor(`g${4}`, 128, bitmap(128));
    expect(cache.markDrawn("impostor:g4:128", 3)).toBe(true);
  });
});
