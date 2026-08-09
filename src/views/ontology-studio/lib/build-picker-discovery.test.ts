import { describe, expect, it } from "vitest";
import { buildPickerDiscovery, NO_DOMAIN_KEY } from "./build-picker-discovery";
import type { StudioSourceEdge, StudioSourceNode } from "./build-studio-item";

const node = (id: string, kind: string, title: string): StudioSourceNode => ({
  id,
  kind,
  title,
  evidenceIds: [],
});
const contains = (from: string, to: string): StudioSourceEdge => ({ from, to, type: "contains" });
const dependsOn = (from: string, to: string): StudioSourceEdge => ({ from, to, type: "depends_on" });

// A small two-domain graph. `capability:checkout` (in Payments) is the focal node.
//   Payments → checkout · refund("Checkout flow") · billing · ledger(element)
//   Auth     → login · token(element)
//   orphan(element) has no containment edge → no domain.
//   checkout depends_on ledger; ledger depends_on token (→ token is aoa of checkout).
const NODES: StudioSourceNode[] = [
  node("project:app", "project", "App"),
  node("domain:pay", "domain", "Payments"),
  node("domain:auth", "domain", "Auth"),
  node("capability:checkout", "capability", "Checkout"),
  node("capability:refund", "capability", "Checkout flow"),
  node("capability:billing", "capability", "Billing"),
  node("element:ledger", "element", "Ledger"),
  node("capability:login", "capability", "Login"),
  node("element:token", "element", "Token"),
  node("element:orphan", "element", "Orphan"),
];
const EDGES: StudioSourceEdge[] = [
  contains("project:app", "domain:pay"),
  contains("project:app", "domain:auth"),
  contains("domain:pay", "capability:checkout"),
  contains("domain:pay", "capability:refund"),
  contains("domain:pay", "capability:billing"),
  contains("domain:pay", "element:ledger"),
  contains("domain:auth", "capability:login"),
  contains("domain:auth", "element:token"),
  dependsOn("capability:checkout", "element:ledger"),
  dependsOn("element:ledger", "element:token"),
];

const DEPENDS_KINDS = new Set(["capability", "element"]);

function dependsDiscovery(over: Partial<Parameters<typeof buildPickerDiscovery>[0]> = {}) {
  return buildPickerDiscovery({
    focalId: "capability:checkout",
    nodes: NODES,
    edges: EDGES,
    relation: "dependsOn",
    allowedKinds: DEPENDS_KINDS,
    ...over,
  });
}

describe("buildPickerDiscovery — suggestions", () => {
  it("never promotes a same-domain same-kind sibling to an isA suggestion", () => {
    const { suggestions, nodesByDomain } = buildPickerDiscovery({
      focalId: "capability:checkout",
      nodes: NODES,
      edges: EDGES,
      relation: "isA",
      allowedKinds: new Set(["capability"]),
    });

    expect(suggestions).toEqual([]);
    // The affordance remains useful: the sibling is still available as a
    // neutral browse candidate, not a claimed parent concept.
    expect(nodesByDomain["domain:pay"].map((candidate) => candidate.id)).toEqual([
      "capability:billing",
      "capability:refund",
    ]);
  });

  it("ranks a same-domain sibling first with the sameDomain reason", () => {
    const { suggestions } = dependsDiscovery();
    const ids = suggestions.map((s) => s.candidate.id);
    expect(ids[0]).toBe("capability:refund");
    expect(suggestions[0].reason).toBe("sameDomain");
    expect(ids).toContain("capability:billing");
  });

  it("surfaces a neighbor-of-neighbor with the adjacentOfAdjacent reason", () => {
    const { suggestions } = dependsDiscovery();
    const token = suggestions.find((s) => s.candidate.id === "element:token");
    expect(token).toBeDefined();
    expect(token?.reason).toBe("adjacentOfAdjacent");
  });

  it("uses the titleSimilar reason when title overlap dominates (no domain/aoa)", () => {
    // A lone capability whose title matches the focal, in a different domain,
    // with no shared neighbors → only the title signal fires.
    const graph: StudioSourceNode[] = [
      node("domain:a", "domain", "A"),
      node("domain:b", "domain", "B"),
      node("capability:focal", "capability", "Payment gateway"),
      node("capability:twin", "capability", "Payment gateway v2"),
    ];
    const edges: StudioSourceEdge[] = [
      contains("domain:a", "capability:focal"),
      contains("domain:b", "capability:twin"),
    ];
    const { suggestions } = buildPickerDiscovery({
      focalId: "capability:focal",
      nodes: graph,
      edges,
      relation: "dependsOn",
      allowedKinds: DEPENDS_KINDS,
    });
    const twin = suggestions.find((s) => s.candidate.id === "capability:twin");
    expect(twin?.reason).toBe("titleSimilar");
  });

  it("never suggests the focal, a directly-connected node, or a staged target", () => {
    const staged = new Set(["capability:billing"]);
    const { suggestions } = dependsDiscovery({ stagedTargetIds: staged });
    const ids = suggestions.map((s) => s.candidate.id);
    expect(ids).not.toContain("capability:checkout"); // focal
    expect(ids).not.toContain("element:ledger"); // directly depends_on
    expect(ids).not.toContain("capability:billing"); // staged
  });

  it("drops nodes with no ranking signal (login has none)", () => {
    const { suggestions } = dependsDiscovery();
    expect(suggestions.map((s) => s.candidate.id)).not.toContain("capability:login");
  });

  it("caps suggestions at maxSuggestions", () => {
    const { suggestions } = dependsDiscovery({ maxSuggestions: 1 });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].candidate.id).toBe("capability:refund");
  });

  it("returns an empty discovery when the focal node is not in the graph", () => {
    const discovery = dependsDiscovery({ focalId: "capability:ghost" });
    expect(discovery.suggestions).toEqual([]);
    expect(discovery.domains).toEqual([]);
    expect(discovery.nodesByDomain).toEqual({});
  });
});

describe("buildPickerDiscovery — kind fit per bearing", () => {
  it("ranks the bearing-preferred kind above an equal-signal peer", () => {
    // Both siblings share the same domain + are adjacent-of-adjacent, so only
    // the contains-bearing kind fit (element > capability) can break the tie.
    const nodes: StudioSourceNode[] = [
      node("domain:d", "domain", "D"),
      node("capability:focal", "capability", "Focal"),
      node("element:piece", "element", "Piece"),
      node("capability:peer", "capability", "Peer"),
    ];
    const edges: StudioSourceEdge[] = [
      contains("domain:d", "capability:focal"),
      contains("domain:d", "element:piece"),
      contains("domain:d", "capability:peer"),
    ];
    const { suggestions } = buildPickerDiscovery({
      focalId: "capability:focal",
      nodes,
      edges,
      relation: "contains",
      allowedKinds: new Set(["capability", "element"]),
    });
    const ids = suggestions.map((s) => s.candidate.id);
    expect(ids.indexOf("element:piece")).toBeLessThan(ids.indexOf("capability:peer"));
  });
});

describe("buildPickerDiscovery — browse tree", () => {
  it("groups candidates by domain with counts, no-domain bucket last", () => {
    const { domains, nodesByDomain } = dependsDiscovery();
    const pay = domains.find((d) => d.domainId === "domain:pay");
    expect(pay?.title).toBe("Payments");
    expect(pay?.count).toBe(2); // refund + billing (ledger excluded, checkout is focal)
    expect(nodesByDomain["domain:pay"].map((c) => c.id)).toEqual([
      "capability:billing",
      "capability:refund",
    ]);
    // the no-domain bucket holds the orphan element and sorts last.
    expect(domains[domains.length - 1].key).toBe(NO_DOMAIN_KEY);
    expect(nodesByDomain[NO_DOMAIN_KEY].map((c) => c.id)).toEqual(["element:orphan"]);
  });

  it("browse excludes the focal / connected / staged nodes too", () => {
    const { nodesByDomain } = dependsDiscovery({ stagedTargetIds: new Set(["capability:billing"]) });
    expect(nodesByDomain["domain:pay"].map((c) => c.id)).toEqual(["capability:refund"]);
  });
});
