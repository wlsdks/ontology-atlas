import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { VaultDoc } from "@/entities/docs-vault";
import { useProjectReviewRows } from "./use-project-review-rows";

const source = vi.hoisted(() => ({ content: {} as Record<string, string> }));

vi.mock("@/entities/vault-session", () => ({
  useDataSourceMode: () => "static",
  useLocalVault: () => ({ fileHandles: new Map() }),
  useStaticVaultSource: () => source,
}));

const raised = (note: string, mtime: number): VaultDoc =>
  ({
    slug: "capabilities/checkout",
    path: "capabilities/checkout.md",
    title: "Checkout",
    mtime,
    frontmatter: { kind: "capability", review_state: "human_decides", review_note: note },
  }) as unknown as VaultDoc;

source.content["capabilities/checkout"] = "---\nkind: capability\n---\nCheckout takes payment.\n";

describe("useProjectReviewRows", () => {
  it("reads before the first queue arrives, so no answer is mistaken for an empty queue", async () => {
    const { result } = renderHook(() => useProjectReviewRows([raised("One or two?", 1)]));
    expect(result.current).toEqual({ rows: [], reading: true });
    await waitFor(() => expect(result.current.reading).toBe(false));
    expect(result.current.rows.map((row) => row.note)).toEqual(["One or two?"]);
  });

  it("keeps the previous rows on screen while a saved document is read again", async () => {
    const { result, rerender } = renderHook(({ docs }) => useProjectReviewRows(docs), { initialProps: { docs: [raised("One or two?", 1)] } });
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    rerender({ docs: [raised("Split it?", 2)] });
    expect(result.current).toMatchObject({ reading: false, rows: [{ note: "One or two?" }] });
    await waitFor(() => expect(result.current.rows[0]?.note).toBe("Split it?"));
  });

  it("is not reading when no document carries a review mark", () => {
    const { result } = renderHook(() => useProjectReviewRows([]));
    expect(result.current).toEqual({ rows: [], reading: false });
  });
});
