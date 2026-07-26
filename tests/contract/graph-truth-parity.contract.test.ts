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
 * 화면 · CLI · MCP 가 **같은 볼트에 같은 개념을 답한다**는 계약.
 *
 * 실측 배경 (2026-07-26) — 웹 지도/인사이트는 296 개념, `ontology-atlas
 * overview` 와 MCP `list_kinds` 는 96 노드였다. 차이 200개는 다른 문서의 관계
 * 키에서 이름만 불린 개념(파생 노드)인데, 어느 화면도 그 경계를 말하지
 * 않았고 CLI·MCP 는 그 존재조차 몰랐다. 지도가 「바꾸면 멀리 퍼지는 개념」
 * 1위로 지목한 노드를 슬러그 그대로 `get_concept` 하면 "없음" 이 돌아왔다 —
 * 이 제품이 파는 약속("사람과 에이전트가 같은 온톨로지를 본다")이 정면으로
 * 깨지는 자리다.
 *
 * 그래서 세 가지를 못 박는다:
 *
 * 1. **문서 있는 개념의 수는 세 입구가 같다** — 웹의 `hasOwnDocument` 노드 수
 *    == 컴파일러 `nodeCount`.
 * 2. **문서 없는 개념의 집합도 같다** — 웹 파생 노드의 참조 원문 집합 ==
 *    컴파일러가 해석하지 못한 참조 집합. 두 곳이 각자 규칙을 쓰면 여기서
 *    갈라진다(실제로 웹이 `slug:` alias 를 몰라 유령 쌍둥이 7개를 만들고
 *    있었다).
 * 3. **화면이 복사해 주는 이름은 붙여넣으면 동작한다** — 모든 노드의 에이전트
 *    이름이 컴파일된 볼트에서 실제로 해석되거나(문서 있음), 볼트가 아는
 *    참조여서 엔진이 "문서만 없다" 고 정직하게 답한다(문서 없음).
 *
 * 숫자를 상수로 못 박지 않는 이유는 `derived-node-document.contract.test.ts`
 * 와 같다 — dogfood 볼트는 자주 자라므로 고정 숫자는 게이트가 아니라 소음이다.
 * 대신 드리프트할 수 없는 **항등식과 집합 동일성**을 건다.
 */

const VAULT_ROOT = join(process.cwd(), "docs/ontology");

interface CompilerDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
  mtime: number;
}

/** `docs/ontology/` 를 MCP 가 물릴 때와 같은 뿌리 기준으로 읽는다. */
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
  edges: Array<{ ref: string; resolved: boolean }>;
  aliases: Array<{ alias: string; slug: string }>;
  nodes: Array<{ slug: string }>;
};

/** 컴파일러가 문서로 해석하지 못한 참조 — "이름만 적힌 개념". */
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
    // 한쪽에만 있는 값이 없어야 한다 — 있으면 두 계층이 같은 참조를 다르게
    // 해석하고 있다는 뜻이고, 그 노드는 화면에서만(또는 CLI 에서만) 존재한다.
    expect([...webRefs].filter((ref) => !referencedOnlyRefs.has(ref))).toEqual([]);
    expect([...referencedOnlyRefs].filter((ref) => !webRefs.has(ref))).toEqual([]);
  });

  it("화면의 총 개념 수 = 컴파일된 노드 + 이름만 적힌 개념 (CLI overview 가 내는 두 수)", () => {
    expect(insight.nodes).toHaveLength(compiled.nodeCount + compiled.referencedOnlyCount);
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
    // 회귀 재현: `evidenceIds[0]` 을 그대로 쓰던 동안 번들 샘플의 모든 문서
    // 노드가 `ontology/` 한 조각 때문에 여기서 걸린다.
    expect(unusable).toEqual([]);
  });
});

/** 인계문 문자열에서 큰따옴표로 감싼 슬러그 인자만 뽑는다. */
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
    // 이 계약이 의미를 가지려면 후보가 실제로 있어야 한다.
    expect(duplicates.rows.length).toBeGreaterThan(0);
    for (const row of duplicates.rows) {
      // 회귀 재현: 예전엔 `ontology/elements/…` 가 나와 즉시 실패했다.
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
    const ref = [...referencedOnlyRefs].sort()[0];
    expect(ref).toBeTruthy();
    const engine = createOntologyEngine(compiled) as {
      nodeProfile: (slug: string) => unknown;
    };
    let thrown: (Error & { referencedBy?: Array<{ slug: string; via: string }> }) | null = null;
    try {
      engine.nodeProfile(ref);
    } catch (err) {
      thrown = err as Error & { referencedBy?: Array<{ slug: string; via: string }> };
    }
    expect(thrown).not.toBeNull();
    // 오타 추측("Did you mean…")으로 엉뚱한 노드를 들이밀지 않는다.
    expect(thrown?.message).not.toMatch(/Did you mean/);
    expect(thrown?.message).toContain("has no document of its own");
    expect(thrown?.referencedBy?.length ?? 0).toBeGreaterThan(0);
  });
});
