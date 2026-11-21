import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTreeProjector, TREE_POSE_REST } from "../model/tree-view/tree-camera";
import { TREE_MARK_BUDGET } from "../model/tree-view/tree-detail";
import { layoutTree } from "../model/tree-view/tree-layout";
import { buildTreeModel } from "../model/tree-view/tree-model";
import type { TreeDrawList } from "../model/tree-view/tree-shapes";
import { readTreeTokens } from "../tokens/read-tree-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { OntologyTreeMap } from "../ui/OntologyTreeMap";
import { cutTreeAtPose } from "../ui/tree-view/use-tree-frame";
import { containmentParents, planLayoutMorph, sampleLayoutMorph } from "./layout-morph";
import { predictTreeTarget, treeMarks } from "./tree-marks";

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
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    return new Proxy(style, {
      get: (target, key) => {
        if (key === "getPropertyValue") return (name: string) => values[name] ?? target.getPropertyValue(name);
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

const CANVAS = { x: 64, y: 0, width: 1448, height: 982 };
const rectOf = ({ x, y, width, height }: typeof CANVAS) => ({ x, y, left: x, top: y, right: x + width, bottom: y + height, width, height, toJSON: () => ({}) });

/** The map's box for its canvases and the tree's root, a toolbar over its top left, a two-line legend, nothing elsewhere. */
function stubLayoutBoxes(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this instanceof HTMLCanvasElement || this.dataset.testid === "tree-map") return rectOf(CANVAS);
    if (this.dataset.testid === "tree-map-footer") return rectOf({ x: CANVAS.x, y: CANVAS.y + CANVAS.height - 64, width: CANVAS.width, height: 48 });
    if (this.dataset.testid === "toolbar") return rectOf({ x: 88, y: 24, width: 300, height: 120 });
    return rectOf({ x: 0, y: 0, width: 0, height: 0 });
  });
}

const node = (id: string, kind: OntologyMapNode["kind"]) => ({ id, label: id, kind }) as unknown as OntologyMapNode;
const contains = (source: string, target: string) => ({ source, target, kind: "contains", relationType: "contains" }) as unknown as OntologyMapEdge;

function vault(domains: number, capabilities: number, elements: number) {
  const nodes = [node("project:p", "project")];
  const edges: OntologyMapEdge[] = [];
  for (let d = 0; d < domains; d += 1) {
    const domain = `domain:${d}`;
    nodes.push(node(domain, "domain"));
    edges.push(contains("project:p", domain));
    for (let c = 0; c < capabilities; c += 1) {
      const capability = `capability:${d}-${c}`;
      nodes.push(node(capability, "capability"));
      edges.push(contains(domain, capability));
      for (let e = 0; e < elements; e += 1) {
        const element = `element:${d}-${c}-${e}`;
        nodes.push(node(element, "element"));
        edges.push(contains(capability, element));
      }
    }
  }
  return { nodes, edges };
}

const labels = { domainMeta: () => "meta", projectMeta: () => "meta", looseCaption: () => "loose" };

describe("the tree's morph marks", () => {
  beforeEach(() => {
    stubTreeTokens();
    stubLayoutBoxes();
    const toolbar = document.createElement("div");
    toolbar.dataset.testid = "toolbar";
    document.body.append(toolbar);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("predicts the marks the tree draws at rest", () => {
    const { nodes, edges } = vault(5, 6, 8);
    const host = document.body.appendChild(document.createElement("canvas"));
    const predicted = predictTreeTarget(nodes, edges, host)!;
    host.remove();
    const { container } = render(
      <OntologyTreeMap nodes={nodes} edges={edges} selectedId={null} evidence={new Map()} evidenceMeasured={false} labels={labels} />,
    );
    const drawn = [...container.querySelectorAll<HTMLElement>("[data-tree-id]")].filter((domElement) => domElement.dataset.mark);
    const at = new Map(predicted.marks.map((m) => [m.id, `${Math.round(m.x)},${Math.round(m.y)},${Math.round(m.size)}`]));
    expect(drawn.length).toBeGreaterThan(30);
    for (const domElement of drawn) expect(at.get(domElement.dataset.treeId!), domElement.dataset.treeId).toBe(domElement.dataset.mark);
  });

  it("carries a concept folded in the tree to the closed mark that holds it", () => {
    const { nodes, edges } = vault(3, 9, 4);
    const tokens = readTreeTokens();
    const model = buildTreeModel(nodes, edges);
    const layout = layoutTree(model);
    const list: TreeDrawList = { marks: [], count: 0, visited: 0, folded: 0 };
    const view = { width: 320, height: 220 };
    cutTreeAtPose(layout, tokens, TREE_POSE_REST, view, { x: 0, y: 0, ...view }, [], createTreeProjector(), list);
    const closed = list.marks.slice(0, list.count).find((m) => m.closed && model.kinds[m.node] === "capability")!;
    expect(closed).toBeDefined();
    const folded = model.ids[closed.node + 1]!;

    const source = { id: folded, x: 0, y: 0, size: 4, shape: "square" as const, fill: "#000", stroke: "#000", alpha: 1 };
    const plan = planLayoutMorph([source], treeMarks(list, model, tokens), containmentParents(nodes, edges));
    const i = plan.ids.indexOf(folded);
    expect([plan.x1[i], plan.y1[i], plan.s1[i]]).toEqual([closed.x, closed.y, closed.radius]);
    expect(sampleLayoutMorph(plan, plan.durationMs).find((m) => m.id === folded)?.alpha).toBe(1);
  });

  it("predicts at most the mark budget of places at 10,000 concepts", () => {
    const { nodes, edges } = vault(40, 25, 9);
    expect(nodes.length).toBeGreaterThan(10_000);
    const host = document.body.appendChild(document.createElement("canvas"));
    const { marks } = predictTreeTarget(nodes, edges, host)!;
    expect(new Set(marks.map((m) => `${m.x},${m.y}`)).size).toBeLessThanOrEqual(TREE_MARK_BUDGET);
  });
});
