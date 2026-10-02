import { describe, expect, it } from "vitest";
import { pickTaxonomyLabel } from "./taxonomy-label";

const entry = { label: "진행중", labelEn: "In Progress", labels: { ja: "進行中" } };

describe("pickTaxonomyLabel", () => {
  it("returns Korean for ko and English for en", () => {
    expect(pickTaxonomyLabel(entry, "ko")).toBe("진행중");
    expect(pickTaxonomyLabel(entry, "en")).toBe("In Progress");
  });

  it("returns the locale's own label, then English, never Korean, for other locales", () => {
    expect(pickTaxonomyLabel(entry, "ja")).toBe("進行中");
    expect(pickTaxonomyLabel(entry, "zh")).toBe("In Progress");
    expect(pickTaxonomyLabel({ label: "진행중" }, "zh")).toBe("진행중");
  });
});
