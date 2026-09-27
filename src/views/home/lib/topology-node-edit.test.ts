import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { resolveNodeVaultRef, resolveTopologyNodeEditTarget } from "./topology-node-edit";

describe("resolveNodeVaultRef", () => {
  const graphNode = (partial: Partial<KnowledgeGraphNode>) =>
    ({ id: "domain:code-evidence", kind: "domain", title: "Code evidence", evidenceIds: [], ...partial }) as KnowledgeGraphNode;

  it("names a documented node by its document's address", () => {
    expect(resolveNodeVaultRef(graphNode({ evidenceIds: ["domains/code-evidence"] }))).toBe(
      "domains/code-evidence",
    );
  });

  it("drops the bundled manifest's root segment", () => {
    expect(resolveNodeVaultRef(graphNode({ evidenceIds: ["ontology/domains/code-evidence"] }))).toBe(
      "domains/code-evidence",
    );
  });

  it("names a node without its own document by the reference the vault wrote, not by its citer", () => {
    expect(
      resolveNodeVaultRef(
        graphNode({ evidenceIds: ["capabilities/citer"], hasOwnDocument: false, ref: "domains/ghost" }),
      ),
    ).toBe("domains/ghost");
  });
});

const node = (evidenceIds: string[]): Pick<KnowledgeGraphNode, "evidenceIds"> => ({
  evidenceIds,
});

const doc = (slug: string, mtime?: number, frontmatter?: Record<string, unknown>) => ({
  slug,
  mtime,
  frontmatter,
});

describe("resolveTopologyNodeEditTarget", () => {
  it("edits the vault document matching evidenceIds[0]", () => {
    const docs = [doc("capabilities/auth", 111, { kind: "capability", domain: "auth" })];
    const target = resolveTopologyNodeEditTarget(node(["capabilities/auth"]), docs);
    expect(target).toEqual({
      vaultSlug: "capabilities/auth",
      mtime: 111,
      frontmatter: { kind: "capability", domain: "auth" },
    });
  });

  it("returns null for empty evidenceIds, a synthetic stub with no document", () => {
    expect(resolveTopologyNodeEditTarget(node([]), [doc("x")])).toBeNull();
  });

  it("returns null without a matching document, as in the static demo or no vault", () => {
    expect(resolveTopologyNodeEditTarget(node(["domains/ghost"]), [doc("capabilities/auth")])).toBeNull();
  });

  it("a document without frontmatter becomes an empty object", () => {
    const target = resolveTopologyNodeEditTarget(node(["elements/jwt"]), [doc("elements/jwt", 9)]);
    expect(target?.frontmatter).toEqual({});
  });
});
