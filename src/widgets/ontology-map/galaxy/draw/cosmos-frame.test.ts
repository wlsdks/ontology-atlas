import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CosmosCamera, CosmosInks, CosmosLens, CosmosRoom, GalaxyPose, LabelCandidate } from "../cosmos-types";
import { computeCosmosLayout, MIN_STAR_SPACING, type CosmosLayout } from "../layout/cosmos-layout";
import { CosmosBitmapCache } from "./cosmos-bitmap-cache";
import { drawCosmosFrame } from "./cosmos-frame";

const fakeCanvas = (size: number) => ({ width: size, height: size }) as unknown as HTMLCanvasElement;
const relationCandidates = vi.hoisted(() => [] as LabelCandidate[]);

vi.mock("./cosmos-paint", () => ({
  IMPOSTOR_EXTENT: 1.32,
  starSprite: () => fakeCanvas(48),
  glowSizeFor: () => 256,
  impostorSizeFor: () => 256,
  buildGalaxyGlow: (_g: unknown, _i: unknown, size: number) => ({ base: fakeCanvas(size), wisps: fakeCanvas(size) }),
  buildStarImpostor: (_g: unknown, size: number) => Object.assign(fakeCanvas(size), { impostor: true }),
}));

vi.mock("./cosmos-web", () => ({
  drawCosmosWeb: () => ({ alpha: 0, items: [], candidates: [] }),
}));

vi.mock("./cosmos-relations", () => ({
  drawCosmosRelations: () => ({ rows: [], candidates: relationCandidates.splice(0), labels: [] }),
  drawCosmosHover: () => [],
  lensAlpha: (lens: unknown) => (lens ? 0.25 : 1),
  galaxyLensAlpha: (lens: unknown) => (lens ? 0.25 : 1),
}));

interface FakeContext {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  composites: string[];
  impostorAlphas: number[];
}

function fakeContext(): FakeContext {
  const calls: string[] = [];
  const composites: string[] = [];
  const impostorAlphas: number[] = [];
  const state: Record<string, unknown> = { globalCompositeOperation: "source-over" };
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 7 });
      if (key === "drawImage") {
        return (image: { impostor?: boolean }) => {
          calls.push(key);
          if (image.impostor) impostorAlphas.push(Number(target.globalAlpha));
        };
      }
      if (key === "createPattern") {
        return () => {
          calls.push("createPattern");
          return { setTransform() {} };
        };
      }
      return () => {
        calls.push(key);
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      if (key === "globalCompositeOperation") {
        composites.push(String(value));
        calls.push(`composite:${String(value)}`);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, composites, impostorAlphas };
}

const inks: CosmosInks = {
  project: "#aabbcc", domain: "#aabbcc", capability: "#aabbcc", element: "#aabbcc", accent: "#aabbcc",
  bgNear: "#101010", bgFar: "#000000", filament: "#aabbcc", filamentHead: "#aabbcc", filamentDim: "#aabbcc",
  labelProject: "#ffffff", labelDomain: "#ffffff", labelCapability: "#ffffff", labelElement: "#ffffff", labelMeta: "#ffffff",
  select: "#aabbcc", spotlightRestAlpha: 0.2, pathRestAlpha: 0.2,
};

function synth(domains: number, capsPer: number, elsPer: number) {
  const nodes: { id: string; label: string; kind: "project" | "domain" | "capability" | "element"; size: number; fullDegree: number }[] = [];
  const edges: { source: string; target: string; kind: "contains"; relationType: string }[] = [];
  nodes.push({ id: "p", label: "Project", kind: "project", size: 1, fullDegree: 1 });
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain", size: 1, fullDegree: 1 });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < capsPer; c += 1) {
      const cap = `d${d}c${c}`;
      nodes.push({ id: cap, label: `Cap ${d}.${c}`, kind: "capability", size: 1, fullDegree: 1 });
      edges.push({ source: `d${d}`, target: cap, kind: "contains", relationType: "contains" });
      for (let e = 0; e < elsPer; e += 1) {
        nodes.push({ id: `${cap}e${e}`, label: `El ${d}.${c}.${e}`, kind: "element", size: 1, fullDegree: 1 });
        edges.push({ source: cap, target: `${cap}e${e}`, kind: "contains", relationType: "contains" });
      }
    }
  }
  return { nodes, edges };
}

let layout: CosmosLayout;
let poses: GalaxyPose[];
const room: CosmosRoom = { x: 0, y: 0, width: 1200, height: 800 };

beforeAll(() => {
  vi.stubGlobal("DOMMatrix", class {});
  const { nodes, edges } = synth(4, 6, 8);
  layout = computeCosmosLayout(nodes, edges);
  poses = layout.galaxies.map((g) => ({ x: g.x, y: g.y, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));
});

function frame(ctx: CanvasRenderingContext2D, camera: CosmosCamera, cache = new CosmosBitmapCache(), deepField: HTMLCanvasElement | null = fakeCanvas(512), lens: CosmosLens | null = null) {
  return drawCosmosFrame({
    ctx, width: 1200, height: 800, dpr: 1, room, camera, overviewScale: camera.scale, layout, inks, poses,
    attention: { selectedId: null, hoverId: null, hoverGalaxy: -1, focusGalaxy: -1, revealMs: 0 },
    relationsOf: () => [], pointOf: () => null, lens, trail: null, record: null, reducedMotion: false,
    cache, deepField, buildBudget: 100,
  });
}

const overview = (): CosmosCamera => {
  const b = layout.bounds;
  const scale = Math.min(room.width / (b.maxX - b.minX), room.height / (b.maxY - b.minY)) * 0.8;
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, scale };
};

describe("drawCosmosFrame", () => {
  it("creates the deep-field pattern once per context and field", () => {
    const fake = fakeContext();
    const cache = new CosmosBitmapCache();
    const field = fakeCanvas(512);
    frame(fake.ctx, overview(), cache, field);
    const first = fake.calls.filter((c) => c === "createPattern").length;
    fake.calls.length = 0;
    frame(fake.ctx, { ...overview(), x: overview().x + 10 }, cache, field);
    expect(first).toBe(1);
    expect(fake.calls.filter((c) => c === "createPattern").length).toBe(0);
  });

  it("bounds every lighter inside save and restore", () => {
    const fake = fakeContext();
    frame(fake.ctx, overview());
    let depth = 0;
    let open = 0;
    for (const call of fake.calls) {
      if (call === "save") depth += 1;
      if (call === "restore") depth -= 1;
      if (call === "composite:lighter") {
        expect(depth).toBeGreaterThan(0);
        open += 1;
      }
    }
    expect(open).toBeGreaterThan(0);
    expect(depth).toBe(0);
  });

  it("names the band from the camera", () => {
    const g = layout.galaxies[0]!;
    expect(frame(fakeContext().ctx, overview()).band).toBe("spine");
    expect(frame(fakeContext().ctx, { x: g.x, y: g.y, scale: 400 / g.radius }).band).toBe("circuit");
    const element = Math.max(17 / MIN_STAR_SPACING, 700 / g.radius);
    expect(frame(fakeContext().ctx, { x: g.x, y: g.y, scale: element }).band).toBe("element");
  });

  it("places the relations' member candidates with the other names", () => {
    relationCandidates.push({ text: "Member", kind: "member", id: "m", x: 600, y: 300, align: "left", font: "12px sans-serif", ink: "#ffffff", priority: 950 });
    const labels = frame(fakeContext().ctx, overview()).labels;
    expect(labels.filter((l) => l.kind === "member").map((l) => l.id)).toEqual(["m"]);
  });

  it("recedes impostors to the lens rest alpha while a lens is active", () => {
    const plain = fakeContext();
    frame(plain.ctx, overview());
    const lensed = fakeContext();
    frame(lensed.ctx, overview(), new CosmosBitmapCache(), null, { kind: "path", memberIds: new Set(["x"]), edgeIds: new Set() });
    expect(plain.impostorAlphas.length).toBeGreaterThan(0);
    expect(plain.impostorAlphas.every((a) => a === 1)).toBe(true);
    expect(lensed.impostorAlphas.every((a) => a === 0.25)).toBe(true);
  });

  it("counts bitmaps the first time they are drawn", () => {
    const cache = new CosmosBitmapCache();
    const first = frame(fakeContext().ctx, overview(), cache);
    const second = frame(fakeContext().ctx, overview(), cache);
    expect(first.firstDraws).toBeGreaterThan(0);
    expect(second.firstDraws).toBe(0);
  });
});
