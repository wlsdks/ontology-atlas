import { describe, expect, it } from "vitest";

import {
  buildBlockedDocumentRows,
  countBlockedDocuments,
  fixBlockOrder,
  type FixBlockKey,
} from "./fix-list";

const WRITABLE = { canWriteVault: true, agentObserved: true };
const READ_ONLY = { canWriteVault: false, agentObserved: false };

describe("fixBlockOrder", () => {
  it("puts blocking work first: unreadable documents, then broken links", () => {
    expect(fixBlockOrder(WRITABLE).slice(0, 2)).toEqual(["blocked-document", "repair"]);
  });

  it("puts meaning work first in a writable session and reverses it when read-only", () => {
    const writable = fixBlockOrder(WRITABLE);
    const readOnly = fixBlockOrder(READ_ONLY);
    expect(writable[2]).toBe("missing-definition");
    expect(readOnly[2]).toBe("neglected-hub");
  });

  it("lists every kind exactly once", () => {
    const expected: FixBlockKey[] = [
      "blocked-document",
      "repair",
      "missing-definition",
      "missing-domain",
      "missing-boundary",
      "missing-uncertainty",
      "epistemic-exclusion",
      "slug-outside-kind-folder",
      "duplicate",
      "promotion",
      "neglected-hub",
      "orphan",
      "cycle",
    ];
    for (const abilities of [WRITABLE, READ_ONLY]) {
      const order = fixBlockOrder(abilities);
      expect(order).toHaveLength(expected.length);
      expect([...order].sort()).toEqual([...expected].sort());
    }
  });
});

describe("buildBlockedDocumentRows", () => {
  const summary = {
    issuesBySlug: [
      { slug: "notes/only-warning", issues: [{ code: "missing-kind" as const, severity: "warning" as const, message: "" }] },
      {
        slug: "capabilities/broken",
        issues: [
          { code: "missing-kind" as const, severity: "warning" as const, message: "" },
          { code: "invalid-uid" as const, severity: "error" as const, message: "" },
        ],
      },
      { slug: "domains/dup", issues: [{ code: "duplicate-uid" as const, severity: "error" as const, message: "" }] },
    ],
  };

  it("makes rows only for documents with errors, not warnings", () => {
    expect(buildBlockedDocumentRows(summary, 10)).toEqual([
      { slug: "capabilities/broken", code: "invalid-uid" },
      { slug: "domains/dup", code: "duplicate-uid" },
    ]);
  });

  it("turns only the first error of a document into a sentence", () => {
    const rows = buildBlockedDocumentRows(summary, 10);
    expect(rows.filter((row) => row.slug === "capabilities/broken")).toHaveLength(1);
  });

  it("stays within the cap", () => {
    expect(buildBlockedDocumentRows(summary, 1)).toHaveLength(1);
  });

  it("still counts the full total when truncated", () => {
    expect(countBlockedDocuments(summary)).toBe(2);
  });
});
