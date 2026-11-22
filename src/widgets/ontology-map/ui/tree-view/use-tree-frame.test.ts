import { readFileSync } from "node:fs";
import path from "node:path";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aimTreeProjector, TREE_POSE_REST } from "../../model/tree-view/tree-camera";
import { layoutTree } from "../../model/tree-view/tree-layout";
import { buildTreeModel } from "../../model/tree-view/tree-model";
import { trunkBlockReservePx } from "../../model/tree-view/tree-names";
import type { TreeModel } from "../../model/tree-view/tree-shapes";
import { readTreeTokens } from "../../tokens/read-tree-tokens";
import { useTreeFrame } from "./use-tree-frame";

vi.mock("../../model/tree-view/tree-camera", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../model/tree-view/tree-camera")>();
  return { ...real, aimTreeProjector: vi.fn(real.aimTreeProjector) };
});

const BORROWED_INKS: Record<string, string> = {
  "--map-graph-project": "#9aa2ff",
  "--map-graph-disc-fill": "#0b0c12",
  "--map-graph-name": "#c9cdd8",
  "--map-graph-name-strong": "#f4f5f9",
  "--map-graph-halo": "#07080c",
  "--map-graph-arc": "#cfd3ff",
  "--map-graph-reach": "#eeaa86",
  "--color-status-warning": "#f4b731",
  "--map-canvas-bg-near": "#0a0a0d",
};

function stubTreeTokens(): void {
  const css = readFileSync(path.join(process.cwd(), "app/styles/map-tree-tokens.css"), "utf8");
  const values: Record<string, string> = {
    ...Object.fromEntries([...css.matchAll(/(--map-tree-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])),
    ...BORROWED_INKS,
  };
  vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: (name: string) => values[name] ?? "" } as CSSStyleDeclaration);
}

const contains = (source: string, target: string) => ({ source, target, kind: "contains" as const, relationType: "contains" });
const layout = layoutTree(
  buildTreeModel(
    [
      { id: "project:p", label: "Project", kind: "project" },
      { id: "domain:d", label: "Domain", kind: "domain" },
      { id: "capability:c", label: "Capability", kind: "capability" },
    ],
    [contains("project:p", "domain:d"), contains("domain:d", "capability:c")],
  ),
);
const FREE = { x: 0, y: 0, width: 800, height: 600 };
const noSub = () => null;

function fitWhenDrawn(nameModel: TreeModel) {
  vi.mocked(aimTreeProjector).mockClear();
  const canvas = { current: document.createElement("canvas") };
  const sources = { layout, nameModel, tokens: readTreeTokens(), size: { width: 800, height: 600 }, dpr: 1, stale: null, focus: null, subOf: noSub, fontFamily: "sans-serif" };
  const { result } = renderHook(() => useTreeFrame(canvas, sources));
  expect(result.current.draw(TREE_POSE_REST, null, 1, FREE)).toBe(true);
  return { ...vi.mocked(aimTreeProjector).mock.calls[0]![4] };
}

describe("the room the camera fits the tree into", () => {
  beforeEach(stubTreeTokens);
  afterEach(() => vi.restoreAllMocks());

  it("leaves the trunk's block room below the tree when the trunk is named", () => {
    const tokens = readTreeTokens();
    const reserve = trunkBlockReservePx(layout.model, noSub, tokens.names, tokens.marks.project);
    expect(reserve).toBeGreaterThan(0);
    expect(fitWhenDrawn(layout.model)).toEqual({ ...FREE, height: FREE.height - reserve });
  });

  it("fits the tree into the whole free area when the trunk has no name", () => {
    const unnamed: TreeModel = { ...layout.model, ids: [null, ...layout.model.ids.slice(1)] };
    expect(fitWhenDrawn(unnamed)).toEqual(FREE);
  });
});
