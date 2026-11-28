import { createTranslator } from "use-intl";
import { describe, expect, it } from "vitest";

import type { SourceOutline } from "@/shared/lib/library/source-outline";

import en from "../../../../../messages/en.json";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
import { outlineRows, outlineSummary } from "./source-outline-rows";

const t = createTranslator({ locale: "en", messages: en, namespace: "library" }) as unknown as Parameters<typeof outlineRows>[1];
const outline = (over: Partial<SourceOutline>) =>
  ({ format: "md", unitCount: 0, headings: [], sheets: [], ...over }) as unknown as SourceOutline;
const ready = (value: SourceOutline): SourceOutlineState => ({ path: "a", phase: "ready", outline: value });

describe("outlineRows", () => {
  it("lists each sheet, then each heading with its address, and no count for markdown", () => {
    const result = outlineRows(outline({ headings: [{ title: "Intro", anchor: "L1" }], unitCount: 4 } as Partial<SourceOutline>), t);
    expect(result.rows).toEqual([{ text: "Intro", anchor: "L1" }]);
    expect(result.count).toBeNull();
  });

  it("counts docx paragraphs beyond its headings, and says nothing when there are none", () => {
    const docx = (unitCount: number) => outlineRows(outline({ format: "docx", unitCount, headings: [{ title: "A", anchor: "h:a" }] } as Partial<SourceOutline>), t);
    expect(docx(4).count).toBe(t("source.outline.paragraphs", { count: 3 }));
    expect(docx(1).count).toBeNull();
  });

  it("counts csv records over every unit", () => {
    expect(outlineRows(outline({ format: "csv", unitCount: 12 }), t).count).toBe(t("source.outline.records", { count: 12 }));
  });
});

describe("outlineSummary", () => {
  it("marks a read that yields neither rows nor a count unreadable, so the sentence prints and no list", () => {
    expect(outlineSummary(ready(outline({ format: "pdf" })), t).unreadable).toBe(true);
    expect(outlineSummary(ready(outline({ format: "csv", unitCount: 3 })), t).unreadable).toBe(false);
  });

  it("is empty and not unreadable while reading or after a failed read", () => {
    expect(outlineSummary({ path: "a", phase: "reading", outline: null }, t)).toEqual({ rows: [], count: null, unreadable: false });
    expect(outlineSummary({ path: "a", phase: "failed", outline: null }, t)).toEqual({ rows: [], count: null, unreadable: false });
  });
});
