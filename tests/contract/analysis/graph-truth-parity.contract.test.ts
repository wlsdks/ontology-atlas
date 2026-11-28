import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import { callServerTool } from "../server-session/call-server-tool";

/**
 * The web and the MCP server must answer with the same concepts for the same vault; identities and
 * set equalities are pinned rather than counts, because the dogfood vault grows. The server is
 * asked over stdio, as an agent asks it.
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");

interface CompiledOntology {
  nodeCount: number;
  referencedOnlyCount: number;
  edges: Array<{ from: string; to: string; via: string; ref: string; resolved: boolean }>;
  aliases: Array<{ alias: string; slug: string }>;
  nodes: Array<{ slug: string }>;
}

/** `compile_ontology` with every array, the whole graph the server compiled from the vault. */
async function compileOverStdio(vault: string): Promise<CompiledOntology> {
  const answer = await callServerTool(vault, "compile_ontology", { full: true });
  expect(answer.isError, String(answer.value)).toBe(false);
  return answer.value as CompiledOntology;
}

const compiled = await compileOverStdio(VAULT_ROOT);

/**
 * Compiler frontmatter key → the web derivation's relation type (and whether the
 * direction flips).
 *
 * The compiler emits **one edge per written reference**. So when both documents
 * record the same relation (a domain's `capabilities:` plus a capability's
 * `domain:`) it counts twice, and `domain:`, where the child points at the parent,
 * also runs the other way. The web folds the same facts by (from,to,type) and
 * counts them as **one distinct relation**.
 */
const COMPILED_VIA_TO_WEB: Record<string, { type: string; reversed?: boolean }> = {
  // `domain: X` points child at parent — containment runs parent → child.
  domain: { type: 'contains', reversed: true },
  domains: { type: 'contains' },
  capabilities: { type: 'contains' },
  elements: { type: 'contains' },
  contains: { type: 'contains' },
  dependencies: { type: 'depends_on' },
  relates: { type: 'related_to' },
  describes: { type: 'describes' },
  broader: { type: 'is_a' },
};

/** References the compiler could not resolve to a document — concepts that exist only as a name. */
const referencedOnlyRefs = new Set(
  compiled.edges.filter((edge) => !edge.resolved).map((edge) => edge.ref),
);
const compiledNames = new Set<string>([
  ...compiled.nodes.map((node) => node.slug),
  ...compiled.aliases.map((entry) => entry.alias),
]);

const derivation = deriveOntologyFromVault(resolveStaticVaultSource("dogfood").manifest);
const insight = derivationToInsight(derivation, "ko", {
  agentSlugPrefix: resolveStaticVaultSource("dogfood").agentSlugPrefix,
});

describe("screen · server concept parity (bundled dogfood == docs/ontology)", () => {
  it("the number of concepts with a document equals the number of compiled nodes", () => {
    const documented = insight.nodes.filter((node) => node.hasOwnDocument !== false);
    expect(documented).toHaveLength(compiled.nodeCount);
  });

  it("the set of concepts without a document is exactly the compiler's unresolved-reference set", () => {
    const webRefs = new Set(
      insight.nodes
        .filter((node) => node.hasOwnDocument === false)
        .map((node) => node.ref ?? node.id),
    );
    // No value may exist on only one side — one that does means the two layers read
    // the same reference differently, and that node exists only on the screen (or
    // only in MCP).
    expect([...webRefs].filter((ref) => !referencedOnlyRefs.has(ref))).toEqual([]);
    expect([...referencedOnlyRefs].filter((ref) => !webRefs.has(ref))).toEqual([]);
  });

  it("the total concept count on screen = compiled nodes + name-only concepts (the two numbers CLI overview emits)", () => {
    expect(insight.nodes).toHaveLength(compiled.nodeCount + compiled.referencedOnlyCount);
  });

  /**
   * Folding compiler edges by (from,to,type) must equal the web's edge set exactly, so whichever side
   * learns a new frontmatter key first is caught here.
   */
  it("folding compiler relations to (from,to,type) gives exactly the relation set on screen", () => {
    const strip = (value: string) => value.replace(/^ontology\//, '');
    const slugOf = new Map<string, string>();
    for (const node of insight.nodes) {
      const own = node.hasOwnDocument === false ? node.ref : node.evidenceIds[0];
      slugOf.set(node.id, strip(own ?? node.id));
    }

    const unknownVia = new Set<string>();
    const compiledSet = new Set<string>();
    for (const edge of compiled.edges) {
      const mapped = COMPILED_VIA_TO_WEB[edge.via];
      if (!mapped) {
        unknownVia.add(edge.via);
        continue;
      }
      const from = mapped.reversed ? edge.to : edge.from;
      const to = mapped.reversed ? edge.from : edge.to;
      compiledSet.add(`${from}|${to}|${mapped.type}`);
    }
    // A new frontmatter relation key in the compiler is the signal to update this table first.
    expect([...unknownVia]).toEqual([]);

    const webSet = new Set(
      insight.edges.map((edge) => `${slugOf.get(edge.from)}|${slugOf.get(edge.to)}|${edge.type}`),
    );

    // Regression reproduction: while `describes:` went unread, 10 entries remained here.
    expect([...compiledSet].filter((key) => !webSet.has(key))).toEqual([]);
    expect([...webSet].filter((key) => !compiledSet.has(key))).toEqual([]);
    // The relation total the screen prints is exactly the size of this set.
    expect(insight.edges).toHaveLength(webSet.size);
  });

  it("every node's agent name resolves in the vault (pasting it works)", () => {
    const unusable: string[] = [];
    for (const node of insight.nodes) {
      const target = resolveNodeAgentTarget(node);
      if (target.ref === null) {
        unusable.push(`${node.id}: no name`);
        continue;
      }
      const known = target.documented
        ? compiledNames.has(target.ref)
        : referencedOnlyRefs.has(target.ref);
      if (!known) unusable.push(`${node.id}: "${target.ref}"`);
    }
    // Regression reproduction: while `evidenceIds[0]` was used verbatim, every
    // document node in the bundled sample was caught here over a single `ontology/`
    // path fragment.
    expect(unusable).toEqual([]);
  });
});

describe("asking about a name-only concept, the engine answers honestly", () => {
  it("returns 'who wrote it under which key' rather than 'none'", async () => {
    const vault = mkdtempSync(join(tmpdir(), "atlas-ghost-parent-"));
    try {
      mkdirSync(join(vault, "capabilities"), { recursive: true });
      writeFileSync(
        join(vault, "capabilities/ghost-parent.md"),
        [
          "---",
          "uid: 01890f3e-7b5d-4c0a-8f14-123456789abc",
          "slug: capabilities/ghost-parent",
          "kind: capability",
          "title: Ghost parent",
          "elements: [elements/ghost-node]",
          "---",
          "",
          "A parent that names an element nobody wrote.",
          "",
        ].join("\n"),
      );
      const synthetic = await compileOverStdio(vault);
      const ref = synthetic.edges.find((edge) => !edge.resolved)?.ref;
      expect(ref).toBe("elements/ghost-node");

      const answer = await callServerTool(vault, "query_ontology", { operation: "neighbors", slug: ref });
      expect(answer.isError).toBe(true);
      const message = (answer.value as { error: string }).error;
      // It must not push a wrong node through a typo guess ("Did you mean…").
      expect(message).not.toMatch(/Did you mean/);
      expect(message).toContain("has no document of its own");
      expect(message).toContain("capabilities/ghost-parent (via elements)");
    } finally {
      rmSync(vault, { recursive: true, force: true });
    }
  });
});
