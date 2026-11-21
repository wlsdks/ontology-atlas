import { describe, expect, it } from "vitest";
import { commitDateOptions, commitHeadlineLines } from "./commit-headline";
import type { CommitConcept } from "./commit-documents";

const t = (key: string, values?: Record<string, string | number>) =>
  values ? `${key}:${Object.values(values).join(",")}` : key;
const concept = (label: string): CommitConcept => ({ id: label, label, kind: "domain" });

describe("commitHeadlineLines", () => {
  it("shows a person's subject as the title, without a conventional prefix and without a second line", () => {
    expect(
      commitHeadlineLines({ t, subject: "feat: add refund rules", headline: null, concepts: [concept("A")] }),
    ).toEqual({ title: "Add refund rules", byline: null });
  });

  it("names an automatic subject by its first two concepts and counts the rest", () => {
    const lines = commitHeadlineLines({
      t,
      subject: "ontology snapshot: 3 changes",
      headline: "Three concepts changed",
      concepts: [concept("A"), concept("B"), concept("C")],
    });
    expect(lines.title).toBe("A, B moreSlugs:1");
    expect(lines.byline).toBe("stepAutoSubject:Three concepts changed");
  });

  it("uses the headline alone when an automatic subject changed no concept", () => {
    expect(
      commitHeadlineLines({ t, subject: "ontology snapshot: 0", headline: "Nothing named", concepts: [] }),
    ).toEqual({ title: "Nothing named", byline: null });
  });
});

describe("commitDateOptions", () => {
  it("spells the year only for another year than today", () => {
    const now = new Date(2026, 5, 15);
    expect(commitDateOptions(new Date(2026, 0, 2), now, "UTC")).not.toHaveProperty("year");
    expect(commitDateOptions(new Date(2025, 11, 31), now, "UTC")).toHaveProperty("year", "numeric");
    expect(commitDateOptions(new Date(2026, 0, 2), now, "Asia/Seoul").timeZone).toBe("Asia/Seoul");
  });
});
