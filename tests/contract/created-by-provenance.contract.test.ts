import { describe, expect, it } from "vitest";

import {
  buildFrontmatter as buildMcp,
  missingExpectedFields as missingMcp,
  agentCreatedBy as agentMcp,
  CREATED_BY_KEY as KEY_MCP,
  CREATED_BY_HUMAN as HUMAN_MCP,
  CREATED_BY_AGENT_UNKNOWN as UNKNOWN_MCP,
  VAULT_KINDS as KINDS_MCP,
  VAULT_KIND_SCHEMA as SCHEMA_MCP,
} from "../../mcp/src/schema.mjs";
import {
  buildFrontmatter as buildCli,
  missingExpectedFields as missingCli,
  agentCreatedBy as agentCli,
  CREATED_BY_KEY as KEY_CLI,
  CREATED_BY_HUMAN as HUMAN_CLI,
  CREATED_BY_AGENT_UNKNOWN as UNKNOWN_CLI,
  VAULT_KIND_SCHEMA as SCHEMA_CLI,
} from "../../cli/src/lib/schema.mjs";
import { parseFilter } from "../../mcp/src/query.mjs";
import { buildNewNodeDoc } from "@/entities/docs-vault";
import { buildProposal } from "@/features/vault-agent/model/proposal-builder";
import { VAULT_CREATED_BY_HUMAN } from "@/entities/docs-vault";

const TEST_UID = "01890f3e-7b5d-4c0a-8f14-123456789abc";

/**
 * Node authorship provenance (`created_by`) contract — ledger 2026-07-31,
 * "Marking human-authored nodes: retroactive provenance does not exist".
 *
 * Four invariants held here:
 *   ① The value convention is `human` | `agent:<name>` and nothing else, and
 *      mcp/cli/web share the same constant.
 *   ② Normalisation **preserves** a value but never **invents** one for a node that
 *      lacks it.
 *   ③ Absence is unknown, not a defect — no validation warning and no default.
 *   ④ "show only what a human made" works as a query filter.
 *
 * Whether the MCP write paths (add_concept / add_concepts / absorb_document) really
 * stamp it, and whether patch_concept preserves it, is only observable with the
 * server running and is owned by `mcp/src/integration.test.mjs`.
 */

/** The `.mjs` schema is untyped — narrowed only at the indexing site. */
function schemaFor(schema: unknown, kind: string): { optional: string[] } {
  return (schema as Record<string, { optional: string[] }>)[kind];
}
function fmOf(frontmatter: unknown): Record<string, unknown> {
  return frontmatter as Record<string, unknown>;
}

describe("created_by 값 규약 — 세 패키지가 같은 상수를 쓴다", () => {
  it("키 이름과 human 값이 mcp · cli · web 에서 동일하다", () => {
    expect(KEY_MCP).toBe("created_by");
    expect(KEY_CLI).toBe(KEY_MCP);
    expect(HUMAN_MCP).toBe("human");
    expect(HUMAN_CLI).toBe(HUMAN_MCP);
    expect(VAULT_CREATED_BY_HUMAN).toBe(HUMAN_MCP);
  });

  it("agentCreatedBy 가 `agent:<name>` 을 만들고 두 사본이 일치한다", () => {
    expect(agentMcp("codex")).toBe("agent:codex");
    expect(agentCli("codex")).toBe(agentMcp("codex"));
    expect(agentMcp("  claude-code  ")).toBe("agent:claude-code");
  });

  it("이름을 모르면 human 이 아니라 agent:unknown 으로 떨어진다", () => {
    // The path proves an agent wrote it but not which agent. Even then there must be no
    // route that falls back to human.
    for (const noName of [null, undefined, "", "   "]) {
      expect(agentMcp(noName)).toBe(UNKNOWN_MCP);
      expect(agentCli(noName)).toBe(UNKNOWN_CLI);
    }
    expect(UNKNOWN_MCP).toBe("agent:unknown");
    expect(UNKNOWN_MCP.startsWith("agent:")).toBe(true);
    expect(UNKNOWN_MCP).not.toBe(HUMAN_MCP);
  });
});

describe("스키마 — 선택 필드로 등록되고 왕복 보존된다", () => {
  it("모든 kind 가 created_by 를 optional 로 인정한다 (mcp · cli 동일)", () => {
    for (const kind of KINDS_MCP as string[]) {
      expect(schemaFor(SCHEMA_MCP, kind).optional).toContain(KEY_MCP);
      expect(schemaFor(SCHEMA_CLI, kind).optional).toEqual(schemaFor(SCHEMA_MCP, kind).optional);
    }
  });

  it("값을 주면 그대로 남는다 — human / agent 양쪽", () => {
    const base = { uid: TEST_UID, slug: "capabilities/x", kind: "capability", title: "X" };
    expect(fmOf(buildMcp({ ...base, created_by: HUMAN_MCP })).created_by).toBe("human");
    expect(fmOf(buildMcp({ ...base, created_by: agentMcp("codex") })).created_by).toBe(
      "agent:codex",
    );
    expect(buildCli({ ...base, created_by: HUMAN_CLI })).toEqual(
      buildMcp({ ...base, created_by: HUMAN_MCP }),
    );
  });

  it("값을 안 주면 키 자체가 생기지 않는다 — 소급 파생 0", () => {
    for (const kind of KINDS_MCP) {
      const input = { uid: TEST_UID, slug: `${kind}-x`, kind, title: "X" };
      const fm = buildMcp(input);
      expect(Object.prototype.hasOwnProperty.call(fm, KEY_MCP)).toBe(false);
      expect(buildCli(input)).toEqual(fm);
    }
  });

  it("부재는 결함이 아니다 — 어떤 kind 도 검증 경고를 만들지 않는다", () => {
    for (const kind of KINDS_MCP) {
      const fm = { slug: "x", kind, title: "X", domain: "d" };
      expect(missingMcp(kind, fm)).not.toContain(KEY_MCP);
      expect(missingCli(kind, fm)).toEqual(missingMcp(kind, fm));
    }
  });
});

describe("질의 필터 — 「사람이 만든 것만 모아보기」", () => {
  const human = { slug: "a", frontmatter: { kind: "capability", created_by: "human" } };
  const agent = { slug: "b", frontmatter: { kind: "capability", created_by: "agent:codex" } };
  const unknown = { slug: "c", frontmatter: { kind: "capability" } };

  it("created_by=human 이 사람 저작만 고른다", () => {
    const { match } = parseFilter("created_by=human");
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["a"]);
  });

  it("스탬프 없는 노드는 human 으로 집계되지 않는다", () => {
    const { match } = parseFilter("created_by=human");
    expect(match(unknown)).toBe(false);
  });

  it("`agent:<name>` 은 따옴표로 지목할 수 있다", () => {
    const { match } = parseFilter('created_by="agent:codex"');
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["b"]);
  });

  it("다른 술어와 조합된다", () => {
    const { match } = parseFilter("kind=capability AND created_by=human");
    expect([human, agent, unknown].filter(match).map((d) => d.slug)).toEqual(["a"]);
  });
});

describe("지도 개념 생성 — 사람이 만든 노드", () => {
  it("직접 저장 문서에 created_by: human 이 실린다", () => {
    const { markdown } = buildNewNodeDoc({
      kind: "capability",
      title: "토큰 발급",
      domain: "auth",
      createdBy: "human",
    });
    expect(markdown).toContain("created_by: human");
  });

  it("사람 스탬프는 frontmatter 안에만 있고 본문을 오염시키지 않는다", () => {
    const { markdown } = buildNewNodeDoc({
      kind: "domain",
      title: "Auth",
      createdBy: "human",
    });
    const [, frontmatter, body] = markdown.split("---");
    expect(frontmatter).toContain("created_by: human");
    expect(body).not.toContain("created_by");
  });
});

describe("내부 채팅 패널 적용 — 초안 저작자는 에이전트다", () => {
  const port = {
    nodes: [],
    edges: [],
    docs: [],
    readDocText: async () => null,
  };
  const labels = {
    createFile: (path: string) => `create ${path}`,
    modifyFile: (path: string) => `modify ${path}`,
    addRelation: () => "relation",
  };

  it("패널이 제안한 새 노드는 agent:<provider> 로 찍힌다", async () => {
    const proposal = await buildProposal({
      intents: [
        { name: "add_concept", args: { slug: "capabilities/x", kind: "capability", title: "X" } },
      ] as never,
      port,
      readNodesThisTurn: [],
      vaultIsGit: false,
      locale: "ko",
      labels,
      agentName: "anthropic",
    });
    const after = proposal?.changes[0]?.files[0]?.after ?? "";
    expect(after).toContain('created_by: "agent:anthropic"');
    // A person clicking "apply" is approval, not authorship — it does not flip to human.
    expect(after).not.toContain("created_by: human");
  });

  it("제공자를 모르면 human 이 아니라 agent:unknown 이다", async () => {
    const proposal = await buildProposal({
      intents: [
        { name: "add_concept", args: { slug: "capabilities/y", kind: "capability", title: "Y" } },
      ] as never,
      port,
      readNodesThisTurn: [],
      vaultIsGit: false,
      locale: "ko",
      labels,
      agentName: null,
    });
    const after = proposal?.changes[0]?.files[0]?.after ?? "";
    expect(after).toContain('created_by: "agent:unknown"');
  });
});
