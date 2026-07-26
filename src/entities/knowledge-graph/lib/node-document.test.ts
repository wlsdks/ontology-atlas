import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "../model/types";
import { resolveNodeDocument } from "./node-document";

const stamp = new Date(0);

function node(extra: Partial<KnowledgeGraphNode>): KnowledgeGraphNode {
  return {
    id: "element:derive-ontology-from-vault",
    title: "Derive Ontology From Vault",
    kind: "element",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: stamp,
    lastApprovedBy: "test",
    ...extra,
  };
}

describe("resolveNodeDocument", () => {
  it("문서 노드의 첫 근거는 자기 문서다", () => {
    expect(
      resolveNodeDocument(node({ evidenceIds: ["capabilities/mcp-server"], hasOwnDocument: true })),
    ).toEqual({ ownSlug: "capabilities/mcp-server", mentionedInSlug: null });
  });

  it("관계에서만 이름이 불린 노드의 첫 근거는 남의 문서다", () => {
    expect(
      resolveNodeDocument(
        node({
          evidenceIds: ["ontology/capabilities/frontmatter-to-ontology"],
          hasOwnDocument: false,
        }),
      ),
    ).toEqual({
      ownSlug: null,
      mentionedInSlug: "ontology/capabilities/frontmatter-to-ontology",
    });
  });

  it("플래그 미지정은 자기 문서로 읽는다 — 새 필드를 모르는 생산 경로 하위 호환", () => {
    expect(resolveNodeDocument(node({ evidenceIds: ["capabilities/legacy"] }))).toEqual({
      ownSlug: "capabilities/legacy",
      mentionedInSlug: null,
    });
  });

  it("근거가 없으면 둘 다 null", () => {
    expect(resolveNodeDocument(node({ evidenceIds: [] }))).toEqual({
      ownSlug: null,
      mentionedInSlug: null,
    });
    expect(resolveNodeDocument(null)).toEqual({ ownSlug: null, mentionedInSlug: null });
  });
});
