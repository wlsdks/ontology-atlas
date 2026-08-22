import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveOntologyFromVault, resolveStaticVaultSource } from "@/entities/docs-vault";
import { resolveNodeAgentTarget } from "@/entities/knowledge-graph";
import { derivationToInsight } from "@/features/vault-ontology/model/use-ontology-insight";
import { buildDuplicatePairs } from "@/views/ontology-insights/lib/duplicate-pairs";
import { buildDoNextQueue } from "@/views/ontology-insights/lib/do-next-queue";
import { compileOntology } from "../../mcp/src/ontology-compiler.mjs";
import { createOntologyEngine } from "../../mcp/src/ontology-engine.mjs";
import { parseFrontmatter } from "../../mcp/src/parser.mjs";

/**
 * The contract that the screen, the CLI, and MCP **answer with the same concepts
 * for the same vault**.
 *
 * Measured background (2026-07-26): the web map and insights reported 296
 * concepts while `ontology-atlas overview` and MCP `list_kinds` reported 96 nodes.
 * The 200 difference were concepts named only inside another document's relation
 * key (derived nodes) — no screen stated that boundary, and the CLI and MCP did
 * not know they existed. Calling `get_concept` with the slug of the node the map
 * ranked first for "changing this spreads furthest" returned "not found" — the
 * exact place where this product's promise ("people and agents see the same
 * ontology") breaks head-on.
 *
 * So three things are pinned:
 *
 * 1. **All three entry points agree on the count of documented concepts** — the
 *    web's `hasOwnDocument` node count == the compiler's `nodeCount`.
 * 2. **The set of undocumented concepts matches too** — the set of raw references
 *    behind the web's derived nodes == the set of references the compiler could
 *    not resolve. Two places applying their own rules diverge here (the web really
 *    did not know about `slug:` aliases and was creating 7 phantom twins).
 * 3. **A name the screen offers for copying works when pasted** — every node's
 *    agent name either resolves in the compiled vault (documented) or is a
 *    reference the vault knows, so the engine honestly answers "only the document
 *    is missing" (undocumented).
 *
 * Numbers are not pinned as constants, for the same reason as
 * `derived-node-document.contract.test.ts`: the dogfood vault grows often, so a
 * fixed number is noise rather than a gate. What is pinned instead are
 * **identities and set equalities**, which cannot drift.
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");

interface CompilerDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
}

/** Reads `docs/ontology/` against the same root MCP uses when it mounts. */
function loadVaultDocs(dir = VAULT_ROOT, base = VAULT_ROOT): CompilerDoc[] {
  const out: CompilerDoc[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...loadVaultDocs(full, base));
      continue;
    }
    if (!entry.name.endsWith(".md")) continue;
    const { frontmatter } = parseFrontmatter(readFileSync(full, "utf8")) as {
      frontmatter: Record<string, unknown>;
    };
    if (!frontmatter?.kind) continue;
    out.push({
      slug: full.slice(base.length + 1).replace(/\.md$/, ""),
      frontmatter,
      mtime: statSync(full).mtimeMs,
    });
  }
  return out;
}

const compiled = compileOntology(loadVaultDocs()) as {
  nodeCount: number;
  referencedOnlyCount: number;
  edges: Array<{ from: string; to: string; via: string; ref: string; resolved: boolean }>;
  aliases: Array<{ alias: string; slug: string }>;
  nodes: Array<{ slug: string }>;
};

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

describe("화면 · CLI · MCP 개념 정합 (번들 dogfood == docs/ontology)", () => {
  it("문서 있는 개념의 수가 컴파일된 노드 수와 같다", () => {
    const documented = insight.nodes.filter((node) => node.hasOwnDocument !== false);
    expect(documented).toHaveLength(compiled.nodeCount);
  });

  it("문서 없는 개념의 집합이 컴파일러의 미해석 참조 집합과 정확히 같다", () => {
    const webRefs = new Set(
      insight.nodes
        .filter((node) => node.hasOwnDocument === false)
        .map((node) => node.ref ?? node.id),
    );
    // No value may exist on only one side — one that does means the two layers read
    // the same reference differently, and that node exists only on the screen (or
    // only in the CLI).
    expect([...webRefs].filter((ref) => !referencedOnlyRefs.has(ref))).toEqual([]);
    expect([...referencedOnlyRefs].filter((ref) => !webRefs.has(ref))).toEqual([]);
  });

  it("화면의 총 개념 수 = 컴파일된 노드 + 이름만 적힌 개념 (CLI overview 가 내는 두 수)", () => {
    expect(insight.nodes).toHaveLength(compiled.nodeCount + compiled.referencedOnlyCount);
  });

  /**
   * Measured background (2026-07-27): web insights reported **448 relations**
   * while the CLI's `overview` and MCP's `query_ontology` reported **542** (those two
   * agreed right down to `graphHash`). Of the 94 difference, 84 was scope (the
   * compiler counts written references, the web counts distinct relations) and
   * **10 was a real hole**: the web derivation did not read the `describes:` key at
   * all, so document nodes were not connected to the concepts they describe.
   *
   * So rather than matching numbers, **the folding rule is pinned** — folding
   * compiler edges by (from,to,type) must equal the web's edge set exactly. Whichever
   * side learns a new frontmatter key first, it is caught here.
   */
  it("컴파일러 관계를 (from,to,type) 로 접으면 화면의 관계 집합과 정확히 같다", () => {
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

  it("모든 노드의 에이전트 이름이 볼트에서 해석된다 (붙여넣으면 동작한다)", () => {
    const unusable: string[] = [];
    for (const node of insight.nodes) {
      const target = resolveNodeAgentTarget(node);
      if (target.ref === null) {
        unusable.push(`${node.id}: 이름 없음`);
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

/** Extracts only the double-quoted slug argument from a handoff string. */
function slugArgumentsIn(payload: string): string[] {
  return [...payload.matchAll(/(?:slug|fromSlug|intoSlug|from)\s*:\s*"([^"]+)"/g)].map(
    (match) => match[1],
  );
}

describe("화면이 복사해 주는 MCP 호출의 인자 (인사이트)", () => {
  const PLACEHOLDERS = new Set(["<대상>", "<근거 한 줄>"]);

  function assertResolvable(payload: string) {
    for (const slug of slugArgumentsIn(payload)) {
      if (PLACEHOLDERS.has(slug)) continue;
      const known = compiledNames.has(slug) || referencedOnlyRefs.has(slug);
      expect(known, `복사되는 호출의 슬러그가 볼트에 없다: "${slug}" — ${payload}`).toBe(true);
    }
  }

  it("「비슷한 이름」 병합 인계의 슬러그가 볼트에서 해석된다", () => {
    const duplicates = buildDuplicatePairs(insight.nodes, insight.edges, 20);
    // Candidates must really exist for this contract to mean anything.
    expect(duplicates.rows.length).toBeGreaterThan(0);
    for (const row of duplicates.rows) {
      // Regression reproduction: this used to emit `ontology/elements/…` and fail immediately.
      assertResolvable(
        `merge_concepts({fromSlug:"${row.dissolveSlug}", intoSlug:"${row.keepSlug}"})`,
      );
    }
  });

  it("「할 일」 행별 인계의 슬러그가 볼트에서 해석된다", () => {
    const freshness = new Map<string, string>();
    for (const node of insight.nodes) {
      const slug = node.evidenceIds[0];
      if (slug) freshness.set(slug, "2020-01-01T00:00:00.000Z");
    }
    const queue = buildDoNextQueue(insight.nodes, insight.edges, freshness);
    expect(queue.rows.length).toBeGreaterThan(0);
    for (const row of queue.rows) assertResolvable(row.handoffPayload);
  });
});

describe("이름만 적힌 개념을 물으면 엔진이 정직하게 답한다", () => {
  it("'없음' 이 아니라 '누가 어떤 키로 적었는지' 를 돌려준다", () => {
    // 2026-08-01: this contract used to require an unresolved reference to **really
    // exist** in dogfood (`expect(ref).toBeTruthy()`) — a gate that demands a defect
    // preserves that defect. The engine's honesty is now always verified against a
    // synthetic sample.
    const syntheticCompiled = compileOntology([
      {
        slug: "capabilities/ghost-parent",
        frontmatter: {
          uid: "01890f3e-7b5d-4c0a-8f14-123456789abc",
          kind: "capability",
          title: "Ghost parent",
          elements: ["elements/ghost-node"],
        },
        mtime: 1,
      },
    ]) as typeof compiled;
    const ref = syntheticCompiled.edges.find((edge) => !edge.resolved)?.ref;
    expect(ref).toBe("elements/ghost-node");
    const engine = createOntologyEngine(syntheticCompiled) as {
      nodeProfile: (slug: string) => unknown;
    };
    let thrown: (Error & { referencedBy?: Array<{ slug: string; via: string }> }) | null = null;
    try {
      engine.nodeProfile(ref!);
    } catch (err) {
      thrown = err as Error & { referencedBy?: Array<{ slug: string; via: string }> };
    }
    expect(thrown).not.toBeNull();
    // It must not push a wrong node through a typo guess ("Did you mean…").
    expect(thrown?.message).not.toMatch(/Did you mean/);
    expect(thrown?.message).toContain("has no document of its own");
    expect(thrown?.referencedBy?.length ?? 0).toBeGreaterThan(0);
  });
});
