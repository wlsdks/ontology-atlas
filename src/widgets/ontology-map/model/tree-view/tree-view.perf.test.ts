import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readTreeTokens, type TreeTokens } from "../../tokens/read-tree-tokens";
import { cutTreeAtPose } from "../../ui/tree-view/use-tree-frame";
import type { TreeInputEdge, TreeInputNode } from "../containment-tree";
import { createTreeProjector, TREE_POSE_REST } from "./tree-camera";
import { TREE_MARK_BUDGET } from "./tree-detail";
import { layoutTree } from "./tree-layout";
import { buildTreeModel } from "./tree-model";
import type { TreeDrawList } from "./types";

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

const CANVAS = { width: 1512, height: 982 };
const FREE = { x: 0, y: 0, ...CANVAS };

/** A unit-interval hash of `k`, so the vault is the same on every run. */
const unit = (k: number) => (Math.imul(k + 1, 2654435761) >>> 0) / 2 ** 32;

/**
 * The `?synth=N` vault's shape: round(sqrt(n) / 3) domains, 15% capabilities, elements skewed onto
 * few capabilities, one in five held by a domain and one in twenty by nothing.
 */
function synthVault(total: number): { nodes: TreeInputNode[]; edges: TreeInputEdge[] } {
  const domains = Math.max(1, Math.round(Math.sqrt(total) / 3));
  const capabilities = Math.round(total * 0.15);
  const elements = total - 1 - domains - capabilities;
  const nodes: TreeInputNode[] = [{ id: "synth-project", label: "Synthetic vault", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contain = (source: string, target: string) => edges.push({ source, target, kind: "contains", relationType: "contains" });
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `synth-domain-${d}`, label: `Domain ${d}`, kind: "domain" });
    contain("synth-project", `synth-domain-${d}`);
  }
  for (let c = 0; c < capabilities; c += 1) {
    nodes.push({ id: `synth-cap-${c}`, label: `Capability ${c}`, kind: "capability" });
    contain(`synth-domain-${Math.floor(unit(c) * domains)}`, `synth-cap-${c}`);
  }
  for (let e = 0; e < elements; e += 1) {
    const id = `synth-el-${e}`;
    nodes.push({ id, label: `Element ${e}`, kind: "element" });
    const r = e % 20;
    if (r === 0) continue;
    if (r % 4 === 0) contain(`synth-domain-${e % domains}`, id);
    else contain(`synth-cap-${Math.floor(unit(e + total) ** 2 * capabilities)}`, id);
  }
  return { nodes, edges };
}

function restCut(total: number, tokens: TreeTokens): TreeDrawList {
  const { nodes, edges } = synthVault(total);
  const layout = layoutTree(buildTreeModel(nodes, edges));
  const list: TreeDrawList = { marks: [], count: 0, visited: 0, folded: 0 };
  cutTreeAtPose(layout, tokens, TREE_POSE_REST, CANVAS, FREE, [], createTreeProjector(), list);
  return list;
}

describe("the tree at rest draws a bounded amount of a synth vault", () => {
  let tokens: TreeTokens;
  beforeAll(() => {
    const css = readFileSync(path.join(process.cwd(), "app/styles/map-tree-tokens.css"), "utf8");
    const values: Record<string, string> = {
      ...Object.fromEntries([...css.matchAll(/(--map-tree-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])),
      ...BORROWED_INKS,
    };
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: (name: string) => values[name] ?? "" } as CSSStyleDeclaration);
    tokens = readTreeTokens();
  });
  afterAll(() => vi.restoreAllMocks());

  it("keeps the 10,000-concept vault within the mark budget", () => {
    const list = restCut(10_000, tokens);
    expect(list.count).toBeGreaterThan(0);
    expect(list.count).toBeLessThanOrEqual(TREE_MARK_BUDGET);
  });

  it("visits no more nodes at 10,000 concepts than at 5,000 plus a tenth", () => {
    const small = restCut(5_000, tokens);
    const large = restCut(10_000, tokens);
    expect(large.visited, `visited ${small.visited} -> ${large.visited}`).toBeLessThanOrEqual(small.visited * 1.1);
  });
});
