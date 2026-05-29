import { describe, expect, it } from "vitest";
import { formatQueryOntologyCall } from "./ontology-query-call";

describe("formatQueryOntologyCall", () => {
  it("payload 를 query_ontology(...) JSON 호출 문자열로", () => {
    expect(
      formatQueryOntologyCall({ operation: "path", from: "a", to: "b" }),
    ).toBe('query_ontology({"operation":"path","from":"a","to":"b"})');
  });

  it("빈 payload → query_ontology({})", () => {
    expect(formatQueryOntologyCall({})).toBe("query_ontology({})");
  });

  it("키 순서(삽입 순서)를 보존한다 — agent 가 읽기 좋은 안정 출력", () => {
    expect(formatQueryOntologyCall({ z: 1, a: 2 })).toBe(
      'query_ontology({"z":1,"a":2})',
    );
  });

  it("중첩 값/배열도 직렬화", () => {
    expect(
      formatQueryOntologyCall({ operation: "all_paths", types: ["x", "y"], maxHops: 5 }),
    ).toBe('query_ontology({"operation":"all_paths","types":["x","y"],"maxHops":5})');
  });
});
