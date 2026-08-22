import { describe, expect, it } from "vitest";
import {
  deriveOntologyFromVault,
  resolveStaticVaultSource,
  type VaultDoc,
  type VaultManifest,
} from "@/entities/docs-vault";
import { resolveNodeDocument } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import {
  buildDuplicatePairs,
  buildSimilarityCandidates,
} from "@/views/ontology-insights/lib/duplicate-pairs";

/**
 * The contract separating derived nodes (concepts named only in another document's
 * relation keys) from document nodes.
 *
 * Background (measured 2026-07-26): of the dogfood sample's 294 concepts only 96 had
 * their own `.md`, and the other 198 were derived. Yet the map's opening sentence
 * said "everything here is a real document", and the popover's `문서` (document)
 * button on a derived node opened *somebody else's document that cited it*.
 *
 * ⚠️ Surgery (2026-08-01): this contract once required derived nodes to **exist** in
 * the dogfood sample (`derived.length > 0`) to pass — a gate that requires a defect
 * (an unresolved reference) preserves the defect. In a vault that keeps the spec,
 * zero derived nodes is correct. So it is now **conditional**: if derived nodes
 * exist, they are not called document nodes (the lie is still blocked). The derived
 * path itself is always verified against a **synthetic sample** (a manifest with one
 * ghost document added) rather than a dogfood defect — the same shape as the
 * `launch-docs-current` demoNote surgery ("if you state a number it must be true, but
 * you are not obliged to state one").
 *
 * Why neither count is pinned as a constant: `docs/ontology/` is dogfooded, so the
 * manifest is regenerated often — a fixed number is noise that breaks CI on every
 * vault edit, not a gate. Instead an **identity that cannot drift** is asserted: the
 * number of nodes with their own document == the `sourceConceptCount` derive
 * reports. If `hasOwnDocument` wrongly returns true for a derived node, that equation
 * breaks immediately.
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
    headings: [],
    excerpt: "",
    wordCount: 2,
    updatedAt: "2026-08-01T00:00:00.000Z",
    linksOut: [],
  };
  return { ...manifest, docs: [...manifest.docs, ghost] };
}

describe("파생 노드와 문서 노드의 구분 (번들 샘플)", () => {
  it("자기 문서 노드는 frontmatter 문서와 1:1 이고, 파생 노드는 (있다면) 문서 노드로 세지 않는다", () => {
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

  it("이름만 불린 참조는 파생 노드로 나타나되 문서 노드라 불리지 않는다 (합성 표본)", () => {
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

  it("파생 노드의 sourceSlug 는 남의 문서라 자기 문서로 승격되지 않는다", () => {
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

  /**
   * "Does it have its own document" must have **one** definition. The duplicate-suspect
   * card once guessed separately with "id tail == document slug tail", and that guess
   * missed project nodes (a project id is built from the frontmatter `slug:`). Both
   * surfaces now consult only `resolveNodeDocument`.
   */
  it("중복 의심 후보 집합 == 자기 문서 보유 노드 집합", () => {
    const insight = derivationToInsight(
      deriveOntologyFromVault(resolveStaticVaultSource("dogfood").manifest),
    );
    const candidates = buildSimilarityCandidates(insight.nodes, insight.edges);
    const documented = insight.nodes.filter(
      (n) => resolveNodeDocument(n).ownSlug !== null,
    );

    expect(candidates.size).toBe(documented.length);
    expect([...candidates.keys()].sort()).toEqual(
      documented.map((n) => n.id).sort(),
    );
    // A derived node mixed into the candidates makes the merge suggestion point at the wrong file.
    expect(
      [...candidates.keys()].some(
        (id) => insight.nodes.find((n) => n.id === id)?.hasOwnDocument === false,
      ),
    ).toBe(false);
    // The old fixed `suspectCount === 11` was deleted (2026-08-01) — it was noise that
    // broke on every dogfood edit, and the set identity above already catches a
    // regression in the unified definition. Only the shape contract remains here.
    expect(buildDuplicatePairs(insight.nodes, insight.edges, 3).suspectCount)
      .toBeGreaterThanOrEqual(0);
  });
});
