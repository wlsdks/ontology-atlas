import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CosmosInks } from "../cosmos-types";
import type { CosmosGalaxy } from "../layout/cosmos-layout";

type Paint = typeof import("./cosmos-paint");

const inks: CosmosInks = {
  project: "#e8e4ff",
  domain: "#858ddd",
  capability: "#a7b0f0",
  element: "#cbd5ef",
  accent: "#6f78d8",
  bgNear: "#0b0d18",
  bgFar: "#05060c",
  filament: "#3a3f70",
  filamentHead: "#5a62a8",
  filamentDim: "#1a1d33",
  labelProject: "#f1f1ff",
  labelDomain: "#e0e2ff",
  labelCapability: "#c8ccef",
  labelElement: "#a0a6cf",
  labelMeta: "#8d92b8",
  select: "#f1d4a2",
  spotlightRestAlpha: 0.2,
  pathRestAlpha: 0.15,
};

let log: string[];
let gradients: number;

let contexts = 0;

function fakeContext() {
  const id = contexts++;
  const ctx = {
    _gco: "source-over",
    globalAlpha: 1,
    fillStyle: "" as unknown,
    filter: "none",
    get globalCompositeOperation() {
      return ctx._gco;
    },
    set globalCompositeOperation(v: string) {
      log.push(`${id}:gco:${v}`);
      ctx._gco = v;
    },
    save: vi.fn(() => log.push(`${id}:save`)),
    restore: vi.fn(() => log.push(`${id}:restore`)),
    translate: vi.fn(),
    scale: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    createRadialGradient: vi.fn(() => {
      gradients += 1;
      return { addColorStop: vi.fn() };
    }),
  };
  return ctx;
}

function galaxy(shape: "spiral" | "elliptical" | "irregular"): CosmosGalaxy {
  const n = 12;
  return {
    id: `g-${shape}`,
    label: shape,
    index: 0,
    x: 0,
    y: 0,
    members: n,
    clusters: [],
    starIds: Array.from({ length: n }, (_, i) => `s${i}`),
    starU: Float32Array.from({ length: n }, (_, i) => i * 3 - 18),
    starV: Float32Array.from({ length: n }, (_, i) => 18 - i * 3),
    starKind: Uint8Array.from({ length: n }, (_, i) => i % 3),
    starMagnitude: Float32Array.from({ length: n }, () => 0.5),
    starCluster: Int32Array.from({ length: n }, () => 0),
    extent: 60,
    shape,
    arms: 4,
    pitch: 0.3,
    spin: 1,
    radius: 50,
    axisRatio: 0.7,
  } as unknown as CosmosGalaxy;
}

let paint: Paint;

beforeEach(async () => {
  log = [];
  gradients = 0;
  vi.resetModules();
  vi.spyOn(document, "createElement").mockImplementation(() => {
    const ctx = fakeContext();
    return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  });
  paint = await import("./cosmos-paint");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildGalaxyGlow", () => {
  it.each(["spiral", "elliptical", "irregular"] as const)("bakes a %s galaxy from at most six cached blob gradients", (shape) => {
    expect(paint.buildGalaxyGlow(galaxy(shape), inks, 512)).not.toBeNull();
    expect(gradients).toBeGreaterThan(0);
    expect(gradients).toBeLessThanOrEqual(6);
    gradients = 0;
    paint.buildGalaxyGlow(galaxy(shape), inks, 512);
    expect(gradients).toBe(0);
  });

  it("never sets a canvas filter", () => {
    const glow = paint.buildGalaxyGlow(galaxy("spiral"), inks, 256);
    const ctx = glow!.base.getContext("2d") as unknown as { filter: string };
    expect(ctx.filter).toBe("none");
  });
});

describe("lighter composite", () => {
  it("sits between a save and its restore in every bake", () => {
    paint.buildGalaxyGlow(galaxy("spiral"), inks, 256);
    paint.buildStarImpostor(galaxy("spiral"), 128, inks);
    const depth = new Map<string, number>();
    let lighters = 0;
    for (const entry of log) {
      const [id, call, value] = entry.split(":");
      const d = depth.get(id!) ?? 0;
      if (call === "save") depth.set(id!, d + 1);
      else if (call === "restore") depth.set(id!, d - 1);
      else if (value === "lighter") {
        lighters += 1;
        expect(d).toBeGreaterThan(0);
      }
      expect(depth.get(id!) ?? 0).toBeGreaterThanOrEqual(0);
    }
    expect(lighters).toBe(3);
    expect([...depth.values()].every((d) => d === 0)).toBe(true);
  });
});
