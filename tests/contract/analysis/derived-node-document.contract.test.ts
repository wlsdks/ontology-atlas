import { describe, expect, it } from "vitest";
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
  type VaultDoc,
  type VaultManifest,
} from "@/entities/docs-vault";
import { resolveNodeDocument } from "@/entities/knowledge-graph";

/**
 * Derived nodes (named only in another document's relation keys) are never called document nodes.
 * Conditional, since zero derived nodes is correct; the derived path runs on a synthetic ghost
 * document. No count is pinned: nodes with their own document must equal `sourceConceptCount`.
 */

/** Adds a ghost document with one unresolved reference to the dogfood manifest. */
function withGhostDoc(manifest: VaultManifest): VaultManifest {
  const ghost: VaultDoc = {
    slug: "ontology/capabilities/ghost-parent",
    path: "docs/ontology/capabilities/ghost-parent.md",
    title: "Ghost parent",
    tags: [],
    frontmatter: {
      kind: "capability",
      title: "Ghost parent",
      elements: ["elements/ghost-node"],
    },
    updatedAt: "2026-08-01T00:00:00.000Z",
    linksOut: [],
  };
  return { ...manifest, docs: [...manifest.docs, ghost] };
}

describe("derived nodes versus document nodes (bundled sample)", () => {
  it("its own document node is 1:1 with a frontmatter document, and derived nodes (if any) are not counted as document nodes", () => {
    const derivation = deriveOntologyFromVault(
      resolveStaticVaultSource("dogfood").manifest,
    );
    const own = derivation.nodes.filter((n) => n.hasOwnDocument);
    const derived = derivation.nodes.filter((n) => !n.hasOwnDocument);

    // The identity — nodes with their own document map exactly 1:1 onto documents carrying a frontmatter `kind:`.
    expect(own).toHaveLength(derivation.sourceConceptCount);
    // No derived-node count is required — 0 is correct for a clean vault.
    expect(own.length + derived.length).toBe(derivation.nodes.length);
  });

  it("a name-only reference appears as a derived node yet is not called a document node (synthetic sample)", () => {
    const derivation = deriveOntologyFromVault(
      withGhostDoc(resolveStaticVaultSource("dogfood").manifest),
    );
    const ghost = derivation.nodes.find((n) => n.id === "element:ghost-node");
    expect(ghost).toBeTruthy();
    expect(ghost!.hasOwnDocument).toBe(false);
    const resolved = resolveNodeDocument({
      evidenceIds: [ghost!.sourceSlug],
      hasOwnDocument: false,
    });
    expect(resolved.ownSlug).toBeNull();
  });

  it("the sourceSlug of a derived node is someone else's document, so it is not promoted to its own document", () => {
    // Runs against the synthetic sample — a clean dogfood vault has 0 derived nodes, so
    // this loop would idle, and an idling gate guards nothing.
    const derivation = deriveOntologyFromVault(
      withGhostDoc(resolveStaticVaultSource("dogfood").manifest),
    );
    const ownSlugs = new Set(
      derivation.nodes.filter((n) => n.hasOwnDocument).map((n) => n.sourceSlug),
    );
    const derived = derivation.nodes.filter((n) => !n.hasOwnDocument);

    for (const stub of derived) {
      const resolved = resolveNodeDocument({
        evidenceIds: [stub.sourceSlug],
        hasOwnDocument: stub.hasOwnDocument,
      });
      expect(resolved.ownSlug).toBeNull();
      // That slug really is *another node's* document — the link works, but a label
      // saying "this node's document" would be a lie.
      expect(ownSlugs.has(stub.sourceSlug)).toBe(true);
    }
  });
});
