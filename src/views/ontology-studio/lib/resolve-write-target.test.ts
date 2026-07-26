import { describe, expect, it } from "vitest";
import { resolveMaterializedNodeId, resolveStudioWriteTarget } from "./resolve-write-target";

describe("resolveStudioWriteTarget", () => {
  it("자기 문서를 가진 노드는 그 문서가 쓰기 대상이다", () => {
    expect(
      resolveStudioWriteTarget({
        id: "capability:mcp-server",
        kind: "capability",
        title: "MCP Server",
        evidenceIds: ["ontology/capabilities/mcp-server"],
        hasOwnDocument: true,
        // 에이전트가 물린 볼트 뿌리 기준 이름은 매니페스트 경로와 다를 수 있다.
        agentSlug: "capabilities/mcp-server",
      }),
    ).toEqual({
      status: "existing",
      slug: "ontology/capabilities/mcp-server",
      agentSlug: "capabilities/mcp-server",
    });
  });

  it("관계에서 이름만 불린 개념은 남의 문서를 쓰기 대상으로 삼지 않는다", () => {
    expect(
      resolveStudioWriteTarget(
        {
          id: "element:payment-gateway",
          kind: "element",
          title: "payment-gateway",
          // 이 개념을 인용한 남의 문서다.
          evidenceIds: ["capabilities/card-payment"],
          hasOwnDocument: false,
        },
        { domainValue: "checkout" },
      ),
    ).toEqual({
      status: "missing",
      slug: "elements/payment-gateway",
      title: "payment-gateway",
      kind: "element",
      domainValue: "checkout",
    });
  });

  it("네 종류 밖의 kind 는 지어내지 않는다 — null 로 두고 사용자가 고른다", () => {
    const target = resolveStudioWriteTarget({
      id: "unknown:legacy-thing",
      kind: "unknown",
      title: "legacy thing",
      evidenceIds: ["capabilities/card-payment"],
      hasOwnDocument: false,
    });
    expect(target.status === "missing" && target.kind).toBeNull();
  });

  /**
   * `hasOwnDocument` 를 모르는 생산 경로(수동 조립 · 테스트 픽스처)는 종전대로
   * 자기 문서로 읽는다 — 읽기 표면의 `resolveNodeDocument` 와 같은 하위 호환.
   */
  it("hasOwnDocument 미지정은 자기 문서로 읽는다", () => {
    expect(
      resolveStudioWriteTarget({
        id: "capability:legacy",
        kind: "capability",
        title: "Legacy",
        evidenceIds: ["capabilities/legacy"],
      }),
    ).toEqual({
      status: "existing",
      slug: "capabilities/legacy",
      agentSlug: "capabilities/legacy",
    });
  });

  /**
   * 2026-07-27 실측 회귀 — 만들어진 문서의 `title:` 이 원본 코드 경로로 박혔다.
   * 저장 전까지 지도·공방·피커가 보여 주던 사람 이름이 파일 어디에도 남지
   * 않았고, 문서함 탭·브레드크럼·H1 이 전부 경로가 됐다.
   */
  it("코드 경로로 불린 개념의 새 문서 title 은 경로가 아니라 사람 이름이다", () => {
    const target = resolveStudioWriteTarget({
      id: "element:srcentitiesdocs-vaultlibderive-ontology-from-vaultts",
      kind: "element",
      title: "src/entities/docs-vault/lib/derive-ontology-from-vault.ts",
      display: "Derive Ontology From Vault",
      evidenceIds: ["capabilities/knowledge-graph"],
      hasOwnDocument: false,
      ref: "src/entities/docs-vault/lib/derive-ontology-from-vault.ts",
    });
    expect(target.status === "missing" && target.title).toBe("Derive Ontology From Vault");
    // 문서는 여전히 인용이 가리키는 자리에 앉는다 — 이름만 사람 것이 된다.
    expect(target.status === "missing" && target.slug).toBe(
      "src/entities/docs-vault/lib/derive-ontology-from-vault.ts",
    );
  });

  it("사람이 이미 이름으로 적어 둔 참조는 원문 그대로 남는다", () => {
    const target = resolveStudioWriteTarget({
      id: "capability:card-payment",
      kind: "capability",
      title: "결제 승인",
      evidenceIds: ["domains/checkout"],
      hasOwnDocument: false,
    });
    expect(target.status === "missing" && target.title).toBe("결제 승인");
  });
});

describe("resolveMaterializedNodeId", () => {
  it("그래프가 이미 새 문서를 알면 그 노드 id 를 쓴다", () => {
    expect(
      resolveMaterializedNodeId("src/entities/foo/bar.ts", "element", [
        { id: "element:other", kind: "element", title: "Other", evidenceIds: ["elements/other"] },
        {
          id: "element:bar.ts",
          kind: "element",
          title: "Bar",
          evidenceIds: ["src/entities/foo/bar.ts"],
          hasOwnDocument: true,
        },
      ]),
    ).toBe("element:bar.ts");
  });

  it("남의 문서를 근거로 가진 노드는 후보가 아니다", () => {
    expect(
      resolveMaterializedNodeId("elements/bar", "element", [
        {
          id: "element:stale-alias",
          kind: "element",
          title: "Bar",
          evidenceIds: ["elements/bar"],
          hasOwnDocument: false,
        },
      ]),
    ).toBe("element:bar");
  });

  it("매니페스트가 아직 따라오기 전이면 derive 가 만들 id 를 계산한다", () => {
    expect(resolveMaterializedNodeId("src/entities/foo/bar.ts", "element", [])).toBe(
      "element:bar.ts",
    );
    expect(resolveMaterializedNodeId("capabilities/ticket", "capability")).toBe(
      "capability:ticket",
    );
  });

  it("project 만 frontmatter slug 전체가 꼬리다", () => {
    expect(resolveMaterializedNodeId("projects/atlas", "project")).toBe("project:projects/atlas");
  });
});
