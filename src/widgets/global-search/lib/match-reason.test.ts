import { describe, expect, it } from "vitest";
import { describeMatchReason, reasonLineClass } from "./match-reason";

const label = "배송비 정책";
const summary = "Decides who pays to move the parcel and how much, before the shopper sees a total.";

describe("describeMatchReason", () => {
  it('shows the description and no marker when the visible name matched', () => {
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

  it('shows the matched name when it is not the visible one', () => {
    expect(
      describeMatchReason({
        matched: { field: "name", text: "Shipping Fee Policy" },
        label,
        summary,
        query: "policy",
      }),
    ).toEqual({ kind: "name", text: "Shipping Fee Policy", query: "policy" });
  });

  it('shows the description from the match position when summary matched', () => {
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

  it('shows the slug when the id matched', () => {
    expect(
      describeMatchReason({
        matched: { field: "id", text: "shipping-fee" },
        label,
        summary,
        query: "fee",
      }),
    ).toEqual({ kind: "id", text: "shipping-fee", query: "fee" });
  });

  it('keeps the description for an empty query', () => {
    expect(describeMatchReason({ label, summary, query: "" })).toEqual({
      kind: "summary",
      text: summary,
    });
  });

  it('leaves the tail cell empty when there is no description and the name matched', () => {
    expect(
      describeMatchReason({ matched: { field: "name", text: label }, label, query: "배송비" }),
    ).toBeNull();
    expect(describeMatchReason({ label, query: "" })).toBeNull();
  });

  it('compares names normalized so case and spacing do not create a second copy', () => {
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
  it('uses a fixed-width cell with one start line from md upward', () => {
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
