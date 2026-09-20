import { describe, expect, it } from "vitest";
import { findNameMatch, idSearchText, normalizeForMatch } from "./node-name-match";

const node = {
  title: "Shipping Fee Policy",
  display: "배송비 정책",
  displayLocales: { ko: "배송비 정책", en: "Shipping Fee Policy" },
};

describe("findNameMatch", () => {
  const ask = (query: string) => findNameMatch(node, normalizeForMatch(query));

  it("어느 이름이 매치를 실어날랐는지 돌려준다", () => {
    expect(ask("policy")).toEqual({ name: "Shipping Fee Policy", tier: "includes" });
    expect(ask("배송비")).toEqual({ name: "배송비 정책", tier: "prefix" });
  });

  it("정확 일치가 가장 세다", () => {
    expect(ask("배송비 정책")).toEqual({ name: "배송비 정책", tier: "equals" });
  });

  it("한글 자판 단계는 글자 그대로 매치보다 아래다", () => {
    expect(ask("ㅂㅅㅂ")?.tier).toBe("hangul-prefix");
    expect(ask("배ㅅ")?.tier).toBe("hangul-prefix");
  });

  it("빈 query 와 매치 없음은 null", () => {
    expect(ask("")).toBeNull();
    expect(ask("zzz")).toBeNull();
  });

  it("정식 title 은 화면 이름이 무엇이든 늘 후보다", () => {
    // The point of the whole module: widening never costs the original.
    expect(ask("Shipping Fee Policy")?.tier).toBe("equals");
  });
});

describe("idSearchText", () => {
  it("kind 접두를 뺀 slug 만 내놓는다", () => {
    expect(idSearchText("element:order-number", "order")).toBe("order-number");
    expect(idSearchText("capability:cart", "cart")).toBe("cart");
  });

  it("콜론이 든 질의는 id 를 통째로 붙여넣은 것이다", () => {
    expect(idSearchText("element:order-number", "element:order")).toBe("element:order-number");
  });

  it("콜론 없는 id 는 통째로 본다", () => {
    expect(idSearchText("auth-logout", "logout")).toBe("auth-logout");
  });

  it("slug 이 비어 있으면 내놓을 것이 없다", () => {
    expect(idSearchText("element:", "x")).toBeNull();
  });
});
