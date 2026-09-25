import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import type { TerritoryInputEdge, TerritoryInputNode } from "../model/territories-layout";
import { computeHexBoard, HEX_TYPE, type HexTextRole } from "../model/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";
import { drawHexBoard, type HexDrawState, type HexEvidenceState } from "./hex-board";

/** A 2D context that records the text it is asked to draw and answers every other call. */
function recordingContext() {
  const texts: string[] = [];
  const gradient = { addColorStop: () => {} };
  const target: Record<string, unknown> = {
    fillText: (t: string) => texts.push(t),
    measureText: (t: string) => ({ width: [...t].length * 6.5 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => null,
    setLineDash: () => {},
    save: () => {},
    restore: () => {},
  };
  const ctx = new Proxy(target, {
    get: (t, key: string) => (key in t ? t[key] : () => {}),
    set: (t, key: string, value) => {
      t[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

const T: HexBoardTokens = {
  face: ["#141419", "#18181f", "#1d1d25", "#23232c", "#2a2a35"],
  faceStale: ["#18150f", "#1c1812", "#221d15", "#282218", "#2f281b"],
  faceDomain: ["#20213a", "#16172a"],
  faceSelected: ["#2a2c55", "#1b1c36"],
  faceProject: ["#262219", "#15130f"],
  riser: "#060608",
  rim: "#5e5f6b",
  rimDomain: "#7c80d8",
  rimSelected: "#a5abff",
  rimUnknown: "#6a6a74",
  hatch: "#2a2a33",
  bevel: ["rgba(255,255,255,0.16)", "rgba(255,255,255,0.03)", "rgba(0,0,0,0.25)"],
  plate: "rgba(94,106,210,0.06)",
  plateFocus: "rgba(94,106,210,0.12)",
  plateStroke: "rgba(136,144,224,0.22)",
  moat: "rgba(255,255,255,0.022)",
  glow: "rgba(94,106,210,0.08)",
  accent: "#9aa0f0",
  canal: "#4a4c62",
  canalHead: "#6d7090",
  inkMeta: "#a3a6ae",
  dimAlpha: 0.3,
  dimFarAlpha: 0.16,
  stale: "#f4b731",
  staleInk: "rgba(239,200,150,0.95)",
  usedBy: "rgba(200,210,255,0.66)",
  indigo: "#5e6ad2",
  indigoBright: "#8890e0",
  hub: "#d4b478",
  hubHairline: "rgba(212,180,120,0.35)",
  ink: "#d0d6e0",
  inkHi: "#f7f8f8",
  inkDim: "#82828a",
  canvas: "#08090a",
  ground: "#0a0a0d",
};

function measure(text: string, role: HexTextRole): number {
  const px = HEX_TYPE[role === "capabilityStrong" ? "capability" : role];
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0)! >= 0x1100 ? 0.95 : role === "mono" ? 0.61 : 0.56) * px;
  return w;
}

function dogfood() {
  const derivation = deriveOntologyFromVault(resolveStaticVaultSource("dogfood").manifest);
  const kinds = new Set(["project", "domain", "capability", "element"]);
  const nodes: TerritoryInputNode[] = derivation.nodes
    .filter((n) => kinds.has(n.kind))
    .map((n) => ({ id: n.id, label: n.displayLocales?.ko ?? n.display ?? n.title, kind: n.kind as TerritoryInputNode["kind"] }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges: TerritoryInputEdge[] = derivation.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ source: e.from, target: e.to, kind: e.type === "contains" ? "contains" : "depends", relationType: e.type }));
  return computeHexBoard(nodes, edges, { aspect: 1.6 });
}

describe("hex board stale-only paint", () => {
  const layout = dogfood();
  const caps = layout.capabilities;
  // Every capability stale, with every file-name shape the Git walk can hand over.
  const shapes = [
    "",
    "graph.mjs",
    "src/widgets/ontology-map/model/a-very-long-file-name-that-never-fits-any-face-at-all.test.tsx",
    "deeply/nested/folder/structure/with/many/levels/index.ts",
    "README",
    "파일 이름 한글.md",
    "no-extension-and-a-long-name-without-dots-anywhere-in-it",
    ".",
    "…",
  ];
  const evidence = new Map<string, HexEvidenceState>(caps.map((c) => [c.id, "stale"]));
  const staleFiles = new Map<string, string>();
  caps.forEach((c, i) => {
    // Some stale capabilities have no moved file at all (a missing path, or folder-only).
    if (i % 5 !== 4) staleFiles.set(c.id, shapes[i % shapes.length]!);
  });

  for (const R of [46, 60, 96, 30, 9]) {
    it(`draws every name at R=${R} with realistic moved files, and never throws`, () => {
      const { ctx, texts } = recordingContext();
      const state: HexDrawState = {
        width: 1512,
        height: 982,
        R,
        ox: 700,
        oy: 480,
        band: R >= 46 ? "names" : R >= 28 ? "pips" : "regions",
        selectedId: null,
        hoverId: caps[3]!.id,
        focusId: null,
        lit: new Set(caps.map((c) => c.id)),
        staleOnly: true,
        focusRegion: null,
        dimT: 1,
        evidence,
        staleFiles,
        staleByDomain: new Map(layout.regions.map((r) => [r.domainId, r.capabilityIds.length])),
        domainMeta: new Map(layout.regions.map((r) => [r.domainId, { meta: `역량 ${r.capabilityIds.length} · 요소 ${r.elementCount}`, stale: `◐ 낡음 ${r.capabilityIds.length}` }])),
        projectMeta: "91 문서",
        plateSub: new Map(),
        routes: [],
        ports: new Map(),
        arrivalMs: null,
        reducedMotion: false,
        sweep: 0.4,
        measure,
      };
      const { stats } = drawHexBoard(ctx, layout, state, T);
      expect(stats.spills).toBe(0);
      if (state.band === "names") {
        expect(stats.names).toBe(layout.tiles.length);
        for (const c of caps) expect(texts.join("\n")).toContain(c.name.split(" ")[0]!);
      }
    });
  }
});
