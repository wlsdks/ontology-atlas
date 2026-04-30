import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { findSimilarOntologyNodes } from "./similarity";

const node = (id: string, title: string, kind = "capability"): KnowledgeGraphNode => ({
  id,
  title,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-04-27T00:00:00Z"),
  lastApprovedBy: "test",
});

describe("findSimilarOntologyNodes", () => {
  const corpus = [
    node("auth-login", "로그인", "capability"),
    node("auth-logout", "로그아웃", "capability"),
    node("session", "세션", "capability"),
    node("login-policy", "로그인 정책", "element"),
    node("auth-domain", "인증", "domain"),
  ];

  it("title 정확 일치 + 같은 kind = 100", () => {
    const r = findSimilarOntologyNodes(
      { title: "로그인", kind: "capability" },
      corpus,
    );
    expect(r[0]?.node.id).toBe("auth-login");
    expect(r[0]?.score).toBe(100);
  });

  it("title 정확 일치 + 다른 kind = 80", () => {
    const r = findSimilarOntologyNodes(
      { title: "로그인", kind: "element" },
      corpus,
    );
    // "로그인" 정확 일치 노드 = auth-login (capability) → 다른 kind = 80
    // "로그인 정책" 은 prefix 일치 + 같은 kind (element) = 60
    expect(r[0]?.node.id).toBe("auth-login");
    expect(r[0]?.score).toBe(80);
    expect(r[1]?.node.id).toBe("login-policy");
    expect(r[1]?.score).toBe(60);
  });

  it("title prefix 일치 + 같은 kind = 60", () => {
    const r = findSimilarOntologyNodes(
      { title: "로그", kind: "capability" },
      corpus,
    );
    // "로그인" / "로그아웃" prefix + capability = 60. "로그인 정책" prefix + element = 50.
    expect(r[0]?.score).toBe(60);
    expect(r[1]?.score).toBe(60);
    expect(r[2]?.score).toBe(50); // login-policy element
    expect(r).toHaveLength(3);
  });

  it("title substring 일치 (prefix 아님) + 다른 kind = 30", () => {
    const r = findSimilarOntologyNodes(
      { title: "정책", kind: "capability" },
      corpus,
    );
    // "로그인 정책" 안에 "정책" substring + element kind 다름 = 30
    expect(r[0]?.node.id).toBe("login-policy");
    expect(r[0]?.score).toBe(30);
  });

  it("id substring 일치 = 20 (title 안 매치 시)", () => {
    const r = findSimilarOntologyNodes(
      { title: "전혀다른", kind: "capability", id: "session" },
      corpus,
    );
    expect(r[0]?.node.id).toBe("session");
    expect(r[0]?.score).toBe(20);
  });

  it("매치 없음 — 빈 결과", () => {
    const r = findSimilarOntologyNodes(
      { title: "xyzqwerty", kind: "capability" },
      corpus,
    );
    expect(r).toHaveLength(0);
  });

  it("빈 candidate (title 도 id 도 비어 있음) — 빈 결과", () => {
    expect(findSimilarOntologyNodes({ title: "", kind: "capability" }, corpus)).toHaveLength(0);
  });

  it("limit 적용", () => {
    const r = findSimilarOntologyNodes({ title: "로그", kind: "capability" }, corpus, 1);
    expect(r).toHaveLength(1);
  });
});
