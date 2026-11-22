import { describe, expect, it } from "vitest";

import type { OntologyMapEdge, OntologyMapNode } from "../../OntologyMap";
import { resolveContainsParents } from "./contains-parents";

const node = (id: string, kind: OntologyMapNode["kind"]) => ({ id, kind });
const contains = (source: string, target: string): Pick<OntologyMapEdge, "kind" | "source" | "target"> => ({
  source,
  target,
  kind: "contains",
});

describe("resolveContainsParents", () => {
  // `element:shared` is declared by `capability:c1` (domain A) and by domain B. Drawing it under B
  // put it outside the domain the INDEX and the census hold it in. `element:local` is declared twice
  // inside domain A, where the later parent only changes depth, so the domain keeps its fan.
  const nodes = [
    node("p", "project"),
    node("domain:a", "domain"),
    node("domain:b", "domain"),
    node("capability:c1", "capability"),
    node("element:shared", "element"),
    node("element:local", "element"),
  ];

  it("keeps the last parent inside a domain and yields to the first parent across domains", () => {
    const parents = resolveContainsParents(nodes, [
      contains("p", "domain:a"),
      contains("p", "domain:b"),
      contains("domain:a", "capability:c1"),
      contains("capability:c1", "element:shared"),
      contains("capability:c1", "element:local"),
      contains("domain:b", "element:shared"),
      contains("domain:a", "element:local"),
    ]);
    expect(parents.get("element:shared")).toBe("capability:c1");
    expect(parents.get("element:local")).toBe("domain:a");
  });

  it("ignores self-containment and non-containment edges", () => {
    const parents = resolveContainsParents(nodes, [
      contains("capability:c1", "capability:c1"),
      { source: "domain:b", target: "element:shared", kind: "depends" },
    ]);
    expect(parents.size).toBe(0);
  });

  it("terminates on a containment cycle with no domain", () => {
    const parents = resolveContainsParents(
      [node("x", "capability"), node("y", "capability")],
      [contains("x", "y"), contains("y", "x"), contains("y", "x")],
    );
    expect(parents.get("y")).toBe("x");
    expect(parents.get("x")).toBe("y");
  });
});
