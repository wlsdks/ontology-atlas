import { describe, expect, it } from "vitest";

import { kindChangeReceipt } from "./kind-change-receipt";

const row = (
  slug: string,
  over: Partial<{ moved: Array<{ ref: string; from: "domains" | "capabilities" | "elements"; to: "domains" | "capabilities" | "elements" }>; kept: Array<{ ref: string; key: "domains" | "capabilities" | "elements" | "domain" }>; failed: boolean }> = {},
) => ({ slug, moved: [], kept: [], failed: false, ...over });

describe("kindChangeReceipt", () => {
  it("says nothing when every referrer only followed the new address", () => {
    expect(kindChangeReceipt({ referrers: [row("capabilities/memory-recall")] })).toBeNull();
    expect(kindChangeReceipt({ referrers: [] })).toBeNull();
  });

  it("names the referrers whose entry moved, and the list it left", () => {
    const move = { ref: "elements/companion-memories", from: "capabilities" as const, to: "elements" as const };
    expect(
      kindChangeReceipt({
        referrers: [
          row("domains/human-workbench", { moved: [move] }),
          row("capabilities/memory-recall"),
          row("ontology-atlas", { moved: [move] }),
        ],
      }),
    ).toEqual({
      tone: "success",
      moved: { slugs: ["domains/human-workbench", "ontology-atlas"], from: "capabilities", to: "elements" },
      kept: { slugs: [] },
      failed: { slugs: [] },
    });
  });

  it("turns to a warning for an entry kept in place or a referrer it could not write", () => {
    const receipt = kindChangeReceipt({
      referrers: [
        row("ontology-atlas", { moved: [{ ref: "x", from: "domains", to: "capabilities" }] }),
        row("domains/d", { moved: [{ ref: "x", from: "elements", to: "capabilities" }] }),
        row("capabilities/recall", { kept: [{ ref: "x", key: "elements" }] }),
        row("domains/locked", { failed: true }),
      ],
    });
    expect(receipt?.tone).toBe("warning");
    // Two different lists were left, so the sentence names only the one arrived at.
    expect(receipt?.moved).toEqual({ slugs: ["ontology-atlas", "domains/d"], from: null, to: "capabilities" });
    expect(receipt?.kept.slugs).toEqual(["capabilities/recall"]);
    expect(receipt?.failed.slugs).toEqual(["domains/locked"]);
  });
});
