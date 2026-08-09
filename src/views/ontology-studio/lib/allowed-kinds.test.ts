import { describe, expect, it } from "vitest";
import { allowedKindsFor, kindAllowedFor } from "./allowed-kinds";

/**
 * C12 ① — 방위 × 초점 kind 후보 필터. 회귀: capability 의 `contains` 후보에
 * domain 이 섞여 나왔다. 계층("한 단계 아래") 창을 강제하는지 검증한다.
 */
describe("allowedKindsFor — 계층 창", () => {
  it("capability 의 contains 후보는 element 만 — domain 은 절대 아님 (회귀)", () => {
    const set = allowedKindsFor("contains", "capability");
    expect(set.has("element")).toBe(true);
    expect(set.has("domain")).toBe(false);
    expect(set.has("capability")).toBe(false);
    expect(kindAllowedFor("contains", "capability", "domain")).toBe(false);
  });

  it("domain 의 contains 후보는 capability·element (한 단계 아래)", () => {
    expect([...allowedKindsFor("contains", "domain")].sort()).toEqual(["capability", "element"]);
  });

  it("project 의 contains 후보는 domain", () => {
    expect([...allowedKindsFor("contains", "project")]).toEqual(["domain"]);
  });

  it("isA 는 domain·capability·element 각각 같은 kind 만 허용한다", () => {
    expect([...allowedKindsFor("isA", "domain")]).toEqual(["domain"]);
    expect([...allowedKindsFor("isA", "capability")]).toEqual(["capability"]);
    expect([...allowedKindsFor("isA", "element")]).toEqual(["element"]);
    expect(allowedKindsFor("isA", "project").size).toBe(0);
  });

  it("dependsOn 은 초점 kind 무관 capability·element", () => {
    for (const focal of ["project", "domain", "capability", "element"]) {
      expect([...allowedKindsFor("dependsOn", focal)].sort()).toEqual(["capability", "element"]);
    }
  });

  it("relates 는 컨테이너로 거슬러 올라가지 않는다 — capability→{capability,element}", () => {
    const set = allowedKindsFor("relates", "capability");
    expect(set.has("domain")).toBe(false);
    expect(set.has("project")).toBe(false);
    expect([...set].sort()).toEqual(["capability", "element"]);
  });

  it("초점 kind 미상이면 relation 별 합집합으로 폭넓게 허용", () => {
    const union = allowedKindsFor("contains", null);
    expect(union.has("domain")).toBe(true);
    expect(union.has("capability")).toBe(true);
    expect(union.has("element")).toBe(true);
  });

  it("초점 kind 를 모르는 isA 는 같은-kind를 증명할 수 없어 fail closed 한다", () => {
    expect(allowedKindsFor("isA", null).size).toBe(0);
  });

  it("core 밖 kind(document/unknown)는 어떤 소켓에도 안 든다", () => {
    for (const rel of ["isA", "dependsOn", "contains", "relates"] as const) {
      for (const focal of ["project", "domain", "capability", "element"]) {
        expect(kindAllowedFor(rel, focal, "document")).toBe(false);
        expect(kindAllowedFor(rel, focal, "unknown")).toBe(false);
      }
    }
  });
});
