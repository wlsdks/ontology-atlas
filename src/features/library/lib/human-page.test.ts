import { describe, expect, it } from "vitest";

import { validateWikiPage } from "@/shared/lib/library/wiki-page-schema";
import { buildHumanPage, humanPageSlug } from "./human-page";

describe("buildHumanPage", () => {
  it("starts a page a person owns, in the contract's shape, that the validator accepts", () => {
    const page = buildHumanPage({ title: "Meeting notes: lighting", now: new Date("2026-09-07T03:00:00Z") });
    expect(page.slug).toBe("wiki/meeting-notes-lighting");
    expect(page.text).toContain("created_by: human");
    expect(page.text).toContain("sources: []");
    expect(validateWikiPage(page.text).problems).toEqual([]);
  });

  it("keeps letters of any script in the slug", () => {
    expect(humanPageSlug("회의 기록 9월")).toBe("wiki/회의-기록-9월");
  });
});
