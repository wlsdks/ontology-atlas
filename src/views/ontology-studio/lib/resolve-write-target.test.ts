import { describe, expect, it } from "vitest";
import { resolveStudioWriteTarget } from "./resolve-write-target";

describe("resolveStudioWriteTarget", () => {
  it("자기 문서를 가진 노드는 그 문서가 쓰기 대상이다", () => {
    expect(
      resolveStudioWriteTarget({
        id: "capability:mcp-server",
        kind: "capability",
        title: "MCP Server",
        evidenceIds: ["ontology/capabilities/mcp-server"],
        hasOwnDocument: true,
      }),
    ).toEqual({ status: "existing", slug: "ontology/capabilities/mcp-server" });
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
    ).toEqual({ status: "existing", slug: "capabilities/legacy" });
  });
});
