import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model/types";
import { resolveNodeDocument } from "./node-document";

const stamp = new Date(0);

function node(extra: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "element:derive-ontology-from-vault",
    title: "Derive Ontology From Vault",
    kind: "element",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

describe("resolveNodeDocument", () => {
  it("uses a node's own document as its first evidence", () => {
    expect(
      resolveNodeDocument(node({ evidenceIds: ["capabilities/mcp-server"], hasOwnDocument: true })),
    ).toEqual({ ownSlug: "capabilities/mcp-server", mentionedInSlug: null });
  });

  it("uses the referring document for a node named only in relations", () => {
    expect(
      resolveNodeDocument(
        node({
          evidenceIds: ["ontology/capabilities/frontmatter-to-ontology"],
          hasOwnDocument: false,
        }),
      ),
    ).toEqual({
      ownSlug: null,
      mentionedInSlug: "ontology/capabilities/frontmatter-to-ontology",
    });
  });

  it("treats a missing flag as an own document", () => {
    expect(resolveNodeDocument(node({ evidenceIds: ["capabilities/legacy"] }))).toEqual({
      ownSlug: "capabilities/legacy",
      mentionedInSlug: null,
    });
  });

  it("returns null for both without evidence", () => {
    expect(resolveNodeDocument(node({ evidenceIds: [] }))).toEqual({
      ownSlug: null,
      mentionedInSlug: null,
    });
    expect(resolveNodeDocument(null)).toEqual({ ownSlug: null, mentionedInSlug: null });
  });
});
