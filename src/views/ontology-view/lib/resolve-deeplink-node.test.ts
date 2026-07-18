import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeDeeplinkNotFoundNotice,
  resolveOntologyDeeplinkNode,
} from "./resolve-deeplink-node";

function node(overrides: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "capability:mcp-server",
    title: "MCP Server",
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
    ...overrides,
  };
}

describe("resolveOntologyDeeplinkNode", () => {
  it("matches the canonical ontology node id", () => {
    const selected = node({ id: "capability:mcp-server" });

    expect(resolveOntologyDeeplinkNode("capability:mcp-server", [selected]))
      .toBe(selected);
  });

  it("matches the vault slug used by builder deep links", () => {
    const selected = node({
      id: "capability:topology-analysis-modes",
      evidenceIds: ["capabilities/topology-analysis-modes"],
    });

    expect(
      resolveOntologyDeeplinkNode("capabilities/topology-analysis-modes", [
        selected,
      ]),
    ).toBe(selected);
  });

  it("matches ontology-prefixed evidence ids", () => {
    const selected = node({
      id: "element:parser",
      kind: "element",
      evidenceIds: ["ontology/elements/parser"],
    });

    expect(resolveOntologyDeeplinkNode("elements/parser", [selected])).toBe(
      selected,
    );
  });

  it("returns null for unknown or empty ids", () => {
    expect(resolveOntologyDeeplinkNode("", [])).toBeNull();
    expect(
      resolveOntologyDeeplinkNode("capabilities/missing", [
        node({ evidenceIds: ["capabilities/mcp-server"] }),
      ]),
    ).toBeNull();
  });

  it("matches a bare slug (post-colon segment of the node id) — agent-handoff deeplinks", () => {
    const selected = node({ id: "capability:mcp-server" });

    expect(resolveOntologyDeeplinkNode("mcp-server", [selected])).toBe(selected);
  });

  it("prefers capability over domain/element/document on bare-slug ambiguity", () => {
    const capability = node({
      id: "capability:reporting",
      kind: "capability",
    });
    const domain = node({
      id: "domain:reporting",
      kind: "domain",
    });
    const element = node({
      id: "element:reporting",
      kind: "element",
    });

    expect(
      resolveOntologyDeeplinkNode("reporting", [element, domain, capability]),
    ).toBe(capability);
  });

  it("prefers domain over element/document when no capability shares the slug", () => {
    const domain = node({ id: "domain:reporting", kind: "domain" });
    const element = node({ id: "element:reporting", kind: "element" });
    const doc = node({ id: "document:reporting", kind: "document" });

    expect(
      resolveOntologyDeeplinkNode("reporting", [doc, element, domain]),
    ).toBe(domain);
  });

  it("falls back to element over document, and is order-independent (deterministic)", () => {
    const element = node({ id: "element:reporting", kind: "element" });
    const doc = node({ id: "document:reporting", kind: "document" });

    expect(resolveOntologyDeeplinkNode("reporting", [doc, element])).toBe(element);
    expect(resolveOntologyDeeplinkNode("reporting", [element, doc])).toBe(element);
  });

  // ADDITIONAL REPRO (owner screenshot, real vault) — the id format the
  // producer emits and the id format the vault node actually carries can
  // disagree on singular-vs-plural `kind` (colon OR folder-slash form), not
  // just on "kind prefix present or absent" (already covered above). A
  // resolver that only checks `node.id === normalized` verbatim silently
  // no-ops here even though the node clearly exists.
  it("resolves 'kind:slug' singular form even when the query's tail doesn't literally equal node.id (real repro string)", () => {
    // vault node's own id happens to already equal this exact string —
    // guards the trivial case (branch 1 direct match) does not regress.
    const target = node({
      id: "element:agent-activity-cli-command",
      kind: "element",
      title: "Agent Activity CLI Command",
    });

    expect(
      resolveOntologyDeeplinkNode("element:agent-activity-cli-command", [target]),
    ).toBe(target);
  });

  it("resolves a 'kinds/slug' plural path-style deeplink against a singular-kind node with the same tail", () => {
    const target = node({
      id: "element:agent-activity-cli-command",
      kind: "element",
      title: "Agent Activity CLI Command",
    });

    expect(
      resolveOntologyDeeplinkNode("elements/agent-activity-cli-command", [target]),
    ).toBe(target);
  });

  it("resolves a 'kind:slug' query even when the vault node's own id carries a plural kind prefix (authoring drift)", () => {
    // Some producer/authoring path stored the node id with a plural kind
    // segment (`elements:` instead of canonical `element:`) — a real id
    // format mismatch, not just a missing kind prefix. The deeplink still
    // names the right tail + a normalizable kind hint, so it should resolve
    // instead of silently no-opping into the default empty state.
    const target = node({
      id: "elements:agent-activity-cli-command",
      kind: "element",
      title: "Agent Activity CLI Command",
    });

    expect(
      resolveOntologyDeeplinkNode("element:agent-activity-cli-command", [target]),
    ).toBe(target);
    expect(
      resolveOntologyDeeplinkNode("elements/agent-activity-cli-command", [target]),
    ).toBe(target);
  });

  it("prefers the kind hint in 'kind:slug' / 'kinds/slug' queries to disambiguate a shared tail", () => {
    const capability = node({ id: "capability:agent-activity-cli-command", kind: "capability" });
    const element = node({ id: "element:agent-activity-cli-command", kind: "element" });

    expect(
      resolveOntologyDeeplinkNode("element:agent-activity-cli-command", [capability, element]),
    ).toBe(element);
    expect(
      resolveOntologyDeeplinkNode("capabilities/agent-activity-cli-command", [capability, element]),
    ).toBe(capability);
  });

  it("prefers the canonical id / builder-slug / evidence match over a bare-slug match", () => {
    const exact = node({ id: "element:mcp-server", kind: "element" });
    const decoy = node({ id: "capability:mcp-server-legacy", kind: "capability" });

    // "mcp-server" bare-slug would only match `decoy` if we stripped
    // "-legacy" — it doesn't, so this just guards that an exact id match
    // short-circuits before bare-slug logic runs at all.
    expect(resolveOntologyDeeplinkNode("element:mcp-server", [exact, decoy])).toBe(
      exact,
    );
  });
});

describe("computeDeeplinkNotFoundNotice", () => {
  it("returns null when there is no deeplink node id", () => {
    expect(computeDeeplinkNotFoundNotice(null, null, null)).toBeNull();
  });

  it("returns null once the selected node already matches the deeplink id", () => {
    expect(
      computeDeeplinkNotFoundNotice("capability:mcp-server", "capability:mcp-server", null),
    ).toBeNull();
  });

  it("returns null when the deeplink id resolved to a node", () => {
    const resolved = node({ id: "capability:mcp-server" });
    expect(
      computeDeeplinkNotFoundNotice("mcp-server", null, resolved),
    ).toBeNull();
  });

  it("returns the raw query when the deeplink id did not resolve — visible notice, no silent no-op", () => {
    expect(
      computeDeeplinkNotFoundNotice("nonexistent-xyz", null, null),
    ).toBe("nonexistent-xyz");
  });
});
