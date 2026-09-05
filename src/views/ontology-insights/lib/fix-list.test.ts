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
  it("차단되는 일이 먼저다 — 못 읽는 문서, 끊어진 연결 순", () => {
    expect(fixBlockOrder(WRITABLE).slice(0, 2)).toEqual(["blocked-document", "repair"]);
  });

  it("쓸 수 있는 세션은 뜻 작업이 먼저, 읽기 전용은 뒤집힌다", () => {
    const writable = fixBlockOrder(WRITABLE);
    const readOnly = fixBlockOrder(READ_ONLY);
    expect(writable[2]).toBe("missing-definition");
    expect(readOnly[2]).toBe("neglected-hub");
  });

  it("모든 종류가 정확히 한 번씩 나온다 — 한 항목이 두 자리에 놓이지 않는다", () => {
    const expected: FixBlockKey[] = [
      "blocked-document",
      "repair",
      "missing-definition",
      "missing-domain",
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

  it("오류가 있는 문서만 행이 된다 — 경고만 있는 문서는 막힌 것이 아니다", () => {
    expect(buildBlockedDocumentRows(summary, 10)).toEqual([
      { slug: "capabilities/broken", code: "invalid-uid" },
      { slug: "domains/dup", code: "duplicate-uid" },
    ]);
  });

  it("첫 오류 하나만 문장이 된다 — 한 문서가 여러 줄로 늘어나지 않는다", () => {
    const rows = buildBlockedDocumentRows(summary, 10);
    expect(rows.filter((row) => row.slug === "capabilities/broken")).toHaveLength(1);
  });

  it("상한을 넘지 않는다", () => {
    expect(buildBlockedDocumentRows(summary, 1)).toHaveLength(1);
  });

  it("잘려도 전체 규모는 따로 셀 수 있다", () => {
    expect(countBlockedDocuments(summary)).toBe(2);
  });
});
