import { describe, it, expect } from "vitest";
import { isOntologyNodeId } from "./ontology-node-id";

describe("isOntologyNodeId", () => {
  it("정확한 kind: prefix + tail → true", () => {
    expect(isOntologyNodeId("capability:mcp-server")).toBe(true);
    expect(isOntologyNodeId("domain:auth")).toBe(true);
    expect(isOntologyNodeId("element:src/features/auth")).toBe(true);
    expect(isOntologyNodeId("project:ontology-atlas")).toBe(true);
    expect(isOntologyNodeId("document:setup")).toBe(true);
    expect(isOntologyNodeId("unknown:legacy-thing")).toBe(true);
  });

  it("project slug (`:` 없음) → false", () => {
    expect(isOntologyNodeId("ontology-atlas")).toBe(false);
    expect(isOntologyNodeId("auth-platform")).toBe(false);
  });

  it("modern colon 포함 슬러그지만 알려진 kind 아님 → false", () => {
    expect(isOntologyNodeId("oh-my:something")).toBe(false);
    expect(isOntologyNodeId("foo:bar")).toBe(false);
    expect(isOntologyNodeId("hub:platform")).toBe(false);
  });

  it("tail 비어있음 (`capability:`) → false (의미 있는 id 아님)", () => {
    expect(isOntologyNodeId("capability:")).toBe(false);
    expect(isOntologyNodeId("domain:")).toBe(false);
  });

  it("빈 / null / non-string → false (throw 안 함)", () => {
    expect(isOntologyNodeId("")).toBe(false);
    // @ts-expect-error — runtime 가드
    expect(isOntologyNodeId(null)).toBe(false);
    // @ts-expect-error — runtime 가드
    expect(isOntologyNodeId(undefined)).toBe(false);
    // @ts-expect-error — runtime 가드
    expect(isOntologyNodeId(123)).toBe(false);
  });
});
