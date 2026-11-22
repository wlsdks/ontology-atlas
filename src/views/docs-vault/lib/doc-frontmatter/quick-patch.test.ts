import { describe, expect, it } from "vitest";
import { buildFrontmatterPatch, isEditableKind, nameLocalesFor, type QuickPatchValues } from "./quick-patch";

describe("nameLocalesFor", () => {
  const FOUR = ["en", "ko", "ja", "zh"];

  it("keeps the en/ko pair in the reader's order", () => {
    expect(nameLocalesFor("en", {})).toEqual(["en", "ko"]);
    expect(nameLocalesFor("ko", {})).toEqual(["ko", "en"]);
  });

  it("asks for the reader's locale, the locales the document names, then the companion", () => {
    expect(nameLocalesFor("ja", { display_zh: "x" }, FOUR)).toEqual(["ja", "zh", "en"]);
    expect(nameLocalesFor("en", { display_ja: "x" }, FOUR)).toEqual(["en", "ja", "ko"]);
    expect(nameLocalesFor("ko", {}, FOUR)).toEqual(["ko", "en"]);
  });

  it("ignores names in locales the app does not route", () => {
    expect(nameLocalesFor("en", { display_fr: "x" }, FOUR)).toEqual(["en", "ko"]);
  });
});

describe("isEditableKind", () => {
  it("accepts the five node kinds and nothing else", () => {
    expect(isEditableKind("capability")).toBe(true);
    expect(isEditableKind("wiki")).toBe(false);
    expect(isEditableKind("")).toBe(false);
  });
});

describe("buildFrontmatterPatch", () => {
  const current: Omit<QuickPatchValues, "kind"> & { kind: string | null } = {
    kind: "capability",
    domain: "shop",
    title: "Checkout",
    names: { en: "Checkout", ko: "" },
  };
  const unchanged: QuickPatchValues = { kind: "capability", domain: "shop", title: "Checkout", names: { en: "Checkout", ko: "" } };

  it("is empty when the form changed nothing", () => {
    expect(buildFrontmatterPatch(unchanged, current, ["en", "ko"])).toEqual({});
  });

  it("carries each changed field, trimmed", () => {
    const patch = buildFrontmatterPatch(
      { kind: "element", domain: " billing ", title: "  Pay  ", names: { en: "Checkout", ko: " 결제 " } },
      current,
      ["en", "ko"],
    );
    expect(patch).toEqual({ kind: "element", domain: "billing", title: "Pay", display_ko: "결제" });
  });

  it("sends null for an emptied domain or name so the key is removed", () => {
    const patch = buildFrontmatterPatch(
      { ...unchanged, domain: "  ", names: { en: "", ko: "" } },
      current,
      ["en", "ko"],
    );
    expect(patch).toEqual({ domain: null, display_en: null });
  });

  it("keeps the old title and kind when they were emptied", () => {
    const patch = buildFrontmatterPatch({ ...unchanged, kind: "", title: "   " }, current, ["en", "ko"]);
    expect(patch).toEqual({});
  });

  it("sets a kind on a document that had none", () => {
    expect(buildFrontmatterPatch({ ...unchanged, kind: "domain" }, { ...current, kind: null }, [])).toEqual({
      kind: "domain",
    });
  });

  it("looks only at the locales it was asked about", () => {
    const patch = buildFrontmatterPatch({ ...unchanged, names: { en: "Other", ko: "x" } }, current, ["en"]);
    expect(patch).toEqual({ display_en: "Other" });
  });
});
