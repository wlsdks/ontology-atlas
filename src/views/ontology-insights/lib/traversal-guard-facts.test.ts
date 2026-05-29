import { describe, expect, it } from "vitest";
import { getTraversalGuardFacts } from "./traversal-guard-facts";

const keys = (payload?: Record<string, unknown>) =>
  getTraversalGuardFacts(payload).map((fact) => fact.key);

describe("getTraversalGuardFacts", () => {
  it("payload 없으면 빈 배열", () => {
    expect(getTraversalGuardFacts()).toEqual([]);
    expect(getTraversalGuardFacts(undefined)).toEqual([]);
  });

  it("bounded-traversal 도 centrality-plan 도 아니면 빈 배열", () => {
    expect(getTraversalGuardFacts({ operation: "match_edges" })).toEqual([]);
    expect(getTraversalGuardFacts({ operation: "query_plan", targetOperation: "match_nodes" })).toEqual([]);
    expect(getTraversalGuardFacts({})).toEqual([]);
  });

  it("all_paths 는 evidence/pathsComplete fact 를 낸다", () => {
    expect(keys({ operation: "all_paths" })).toEqual(["evidence-status", "paths-complete"]);
  });

  it("query_plan + all_paths 는 plan-first fact 만 (evidence fact 는 all_paths 직접 호출 한정)", () => {
    expect(keys({ operation: "query_plan", targetOperation: "all_paths" })).toEqual(["plan"]);
  });

  it("query_plan + centrality 는 plan + ranking + dangling fact", () => {
    expect(keys({ operation: "query_plan", targetOperation: "centrality" })).toEqual([
      "plan",
      "ranking-work",
      "dangling",
    ]);
  });

  it("정수 가드 파라미터를 label 과 함께 덧붙인다", () => {
    const facts = getTraversalGuardFacts({
      operation: "all_paths",
      searchBudget: 1000,
      maxHops: 4,
      iterations: 3,
      limit: 10,
    });
    const byKey = Object.fromEntries(facts.map((f) => [f.key, f.label]));
    expect(byKey.budget).toBe("budget 1000");
    expect(byKey.maxHops).toBe("maxHops 4");
    expect(byKey.iterations).toBe("iterations 3");
    expect(byKey.limit).toBe("limit 10");
  });

  it("maxHops 0 은 (non-negative) 포함, searchBudget/limit 0 은 (positive) 제외", () => {
    const facts = getTraversalGuardFacts({
      operation: "all_paths",
      maxHops: 0,
      searchBudget: 0,
      limit: 0,
    });
    const seen = facts.map((f) => f.key);
    expect(seen).toContain("maxHops");
    expect(seen).not.toContain("budget");
    expect(seen).not.toContain("limit");
  });

  it("정수가 아니거나 음수인 가드 파라미터는 무시", () => {
    const facts = getTraversalGuardFacts({
      operation: "all_paths",
      searchBudget: 1.5,
      maxHops: -1,
      limit: "10",
    });
    const seen = facts.map((f) => f.key);
    expect(seen).not.toContain("budget");
    expect(seen).not.toContain("maxHops");
    expect(seen).not.toContain("limit");
  });

  it("types 는 string 만 남기고 label 로 join, 비어있으면 생략", () => {
    expect(
      getTraversalGuardFacts({
        operation: "all_paths",
        types: ["contains", "", 42, "depends_on"],
      }).find((f) => f.key === "types")?.label,
    ).toBe("types contains, depends_on");
    expect(
      getTraversalGuardFacts({ operation: "all_paths", types: [] }).map((f) => f.key),
    ).not.toContain("types");
  });
});
