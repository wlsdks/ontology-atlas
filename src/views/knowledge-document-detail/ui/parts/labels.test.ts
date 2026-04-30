import { describe, expect, it } from "vitest";
import type { KnowledgeOutput } from "@/entities/knowledge-output";
import { resolveNodeKindLabel, resolveOutputNodeTitle } from "./labels";

describe("resolveNodeKindLabel", () => {
  it("정의된 kind 5 종 + concept 매핑", () => {
    expect(resolveNodeKindLabel("document")).toBe("문서");
    expect(resolveNodeKindLabel("project")).toBe("프로젝트");
    expect(resolveNodeKindLabel("domain")).toBe("도메인");
    expect(resolveNodeKindLabel("capability")).toBe("기능");
    expect(resolveNodeKindLabel("element")).toBe("요소");
    expect(resolveNodeKindLabel("concept")).toBe("관련 개념");
  });

  it("정의 외 kind 는 raw 그대로 반환 (dead label 회피)", () => {
    expect(resolveNodeKindLabel("alien-kind")).toBe("alien-kind");
  });

  it("빈 문자열은 '미정' fallback", () => {
    expect(resolveNodeKindLabel("")).toBe("미정");
  });
});

describe("resolveOutputNodeTitle", () => {
  const output = {
    nodes: [
      { tempId: "n1", title: "노드 가" },
      { tempId: "n2", title: "노드 나" },
    ],
    edges: [],
  } as unknown as KnowledgeOutput;

  it("매치되는 tempId 의 title 반환", () => {
    expect(resolveOutputNodeTitle(output, "n1")).toBe("노드 가");
    expect(resolveOutputNodeTitle(output, "n2")).toBe("노드 나");
  });

  it("매치 없는 tempId 는 tempId 자체 반환 (fallback)", () => {
    expect(resolveOutputNodeTitle(output, "missing")).toBe("missing");
  });

  it("빈 nodes 배열도 안전하게 fallback", () => {
    const empty = { nodes: [], edges: [] } as unknown as KnowledgeOutput;
    expect(resolveOutputNodeTitle(empty, "any")).toBe("any");
  });
});
