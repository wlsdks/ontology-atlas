import { describe, expect, it } from "vitest";
import { describeMatchReason, reasonLineClass } from "./match-reason";

const label = "배송비 정책";
const summary = "Decides who pays to move the parcel and how much, before the shopper sees a total.";

describe("describeMatchReason", () => {
  it("화면에 있는 이름으로 걸리면 꼬리 칸은 설명이고, 표시는 없다", () => {
    // The mark is already on the name; a second one would make the first ambiguous.
    expect(
      describeMatchReason({
        matched: { field: "name", text: "배송비 정책" },
        label,
        summary,
        query: "배송비",
      }),
    ).toEqual({ kind: "summary", text: summary });
  });

  it("화면에 없는 이름으로 걸리면 그 이름을 보여준다", () => {
    expect(
      describeMatchReason({
        matched: { field: "name", text: "Shipping Fee Policy" },
        label,
        summary,
        query: "policy",
      }),
    ).toEqual({ kind: "name", text: "Shipping Fee Policy", query: "policy" });
  });

  it("summary 로 걸리면 매치 자리에서 연 설명을 보여준다", () => {
    const reason = describeMatchReason({
      matched: { field: "summary", text: summary },
      label,
      summary,
      query: "shopper",
    });
    expect(reason?.kind).toBe("summary");
    expect(reason?.query).toBe("shopper");
    expect(reason?.text.startsWith("…")).toBe(true);
    expect(reason?.text).toContain("shopper");
  });

  it("id 로 걸리면 slug 를 보여준다", () => {
    expect(
      describeMatchReason({
        matched: { field: "id", text: "shipping-fee" },
        label,
        summary,
        query: "fee",
      }),
    ).toEqual({ kind: "id", text: "shipping-fee", query: "fee" });
  });

  it("빈 query — 근거가 없으면 설명을 그대로 둔다", () => {
    expect(describeMatchReason({ label, summary, query: "" })).toEqual({
      kind: "summary",
      text: summary,
    });
  });

  it("설명이 없고 이름으로 걸렸으면 꼬리 칸은 비어 있다", () => {
    expect(
      describeMatchReason({ matched: { field: "name", text: label }, label, query: "배송비" }),
    ).toBeNull();
    expect(describeMatchReason({ label, query: "" })).toBeNull();
  });

  it("이름 비교는 정규화된 것끼리 한다 — 대소문자·공백이 두 번째 사본을 만들지 않는다", () => {
    expect(
      describeMatchReason({
        matched: { field: "name", text: "Shipping  Fee  Policy" },
        label: "shipping fee policy",
        summary,
        query: "policy",
      }),
    ).toEqual({ kind: "summary", text: summary });
  });
});

describe("reasonLineClass", () => {
  // Measured 2026-09-19 at 390x844: the reason column was `md:`-only, so a phone
  // showed 4 rows for "policy" and 20 for "order" and "shopper" with no mark at all —
  // the whole answer went away with the class that hid it.
  it("표시를 다는 근거는 좁은 화면에서 이름 아래 한 줄을 얻는다", () => {
    const evidence = reasonLineClass({ kind: "name", text: "Shipping Fee Policy", query: "policy" });
    expect(evidence).toContain("block");
    expect(evidence).not.toContain("hidden");
  });

  it("표시가 없는 맥락 설명은 md 부터의 칸으로 남는다", () => {
    // Its second line would double every phone row to repeat what the row is not
    // there for; the name above it is already the answer.
    const context = reasonLineClass({ kind: "summary", text: "Decides who pays." });
    expect(context).toContain("hidden");
    expect(context).toContain("md:block");
  });

  it("어느 쪽이든 md 부터는 한 시작선을 갖는 고정폭 칸이다", () => {
    for (const reason of [
      { kind: "id" as const, text: "shipping-fee", query: "fee" },
      { kind: "summary" as const, text: "Decides who pays." },
    ]) {
      const className = reasonLineClass(reason);
      expect(className).toContain("md:w-[14rem]");
      expect(className).toContain("md:shrink-0");
      expect(className).not.toContain("max-w-");
    }
  });
});
