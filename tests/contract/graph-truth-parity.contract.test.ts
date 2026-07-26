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
  edges: Array<{ from: string; to: string; via: string; ref: string; resolved: boolean }>;
  aliases: Array<{ alias: string; slug: string }>;
  nodes: Array<{ slug: string }>;
};

/**
 * 컴파일러의 frontmatter 키 → 웹 derive 의 관계 타입(+방향 뒤집힘 여부).
 *
 * 컴파일러는 **적힌 참조 하나당 엣지 하나**를 낸다. 그래서 같은 관계를 양쪽
 * 문서가 다 적으면(도메인의 `capabilities:` + 역량의 `domain:`) 두 번 세고,
 * 자식이 부모를 가리키는 `domain:` 은 방향도 반대다. 웹은 같은 사실을
 * (from,to,type) 로 접어 **서로 다른 관계 하나**로 센다.
 */
const COMPILED_VIA_TO_WEB: Record<string, { type: string; reversed?: boolean }> = {
  // `domain: X` 는 자식이 부모를 가리킨다 — 담기 관계의 방향은 부모→자식이다.
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

  /**
   * 실측 배경 (2026-07-27) — 웹 인사이트는 **448 관계**, CLI `overview` 와 MCP
   * `query_ontology` 는 **542** 였다(둘은 `graphHash` 까지 완전 일치). 차이 94 중
   * 84 는 스코프였고(컴파일러는 적힌 참조를, 웹은 서로 다른 관계를 센다),
   * **10 은 진짜 구멍**이었다: 웹 derive 가 `describes:` 키를 통째로 안 읽어
   * 문서 노드가 자기가 설명하는 개념과 이어지지 않았다.
   *
   * 그래서 숫자를 맞추는 대신 **접는 규칙을 못 박는다** — 컴파일러 엣지를
   * (from,to,type) 로 접으면 웹 엣지 집합과 정확히 같아야 한다. 어느 쪽이 새
   * frontmatter 키를 먼저 배워도 여기서 걸린다.
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
    // 새 frontmatter 관계 키가 컴파일러에 생기면 이 표부터 갱신하라는 신호다.
    expect([...unknownVia]).toEqual([]);

    const webSet = new Set(
      insight.edges.map((edge) => `${slugOf.get(edge.from)}|${slugOf.get(edge.to)}|${edge.type}`),
    );

    // 회귀 재현: `describes:` 를 안 읽던 동안 여기 10건이 남았다.
    expect([...compiledSet].filter((key) => !webSet.has(key))).toEqual([]);
    expect([...webSet].filter((key) => !compiledSet.has(key))).toEqual([]);
    // 화면이 찍는 관계 총계는 곧 이 집합의 크기다.
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
