import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { OntologyTreeMap, type TreeMapLabels } from "./OntologyTreeMap";

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

const node = (id: string, kind: OntologyMapNode["kind"]) => ({ id, label: id, kind }) as unknown as OntologyMapNode;
const contains = (source: string, target: string) => ({ source, target, kind: "contains", relationType: "contains" }) as unknown as OntologyMapEdge;

const nodes = [
  node("project:p", "project"),
  node("domain:d", "domain"),
  node("capability:c1", "capability"),
  node("capability:c2", "capability"),
  node("element:e1", "element"),
  node("element:e2", "element"),
  node("element:e3", "element"),
];
const edges = [
  contains("project:p", "domain:d"),
  contains("domain:d", "capability:c1"),
  contains("domain:d", "capability:c2"),
  contains("capability:c1", "element:e1"),
  contains("capability:c1", "element:e2"),
  contains("capability:c2", "element:e3"),
];

const labels: TreeMapLabels = {
  domainMeta: () => "meta",
  projectMeta: () => "meta",
  looseCaption: () => "loose",
};

const props = { edges, evidence: new Map(), evidenceMeasured: false, labels };

function listedIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="tree-map-list"] [data-tree-id]')].map((el) => el.dataset.treeId!).sort();
}

describe("the tree's accessible list", () => {
  beforeEach(stubTreeTokens);
  afterEach(() => vi.restoreAllMocks());

  it("holds the trunk, domains and capabilities, and the selected capability's elements", () => {
    const { container, rerender } = render(<OntologyTreeMap {...props} nodes={nodes} selectedId={null} />);
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "domain:d", "project:p"]);

    rerender(<OntologyTreeMap {...props} nodes={nodes} selectedId="capability:c1" />);
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "domain:d", "element:e1", "element:e2", "project:p"]);
  });

  it("rebuilds the tree when the vault changes", () => {
    const { container, rerender } = render(<OntologyTreeMap {...props} nodes={nodes} selectedId={null} />);
    rerender(
      <OntologyTreeMap
        {...props}
        nodes={[...nodes, node("domain:d2", "domain"), node("capability:c3", "capability")]}
        edges={[...edges, contains("project:p", "domain:d2"), contains("domain:d2", "capability:c3")]}
        selectedId={null}
      />,
    );
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "capability:c3", "domain:d", "domain:d2", "project:p"]);
  });
});
