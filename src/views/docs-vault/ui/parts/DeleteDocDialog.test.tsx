import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../../messages/ko.json";
import { DeleteDocDialog, type DeleteDocTarget } from "./DeleteDocDialog";

/*
 * Map-edit QA D7 (2026-09-26): the delete confirmation read only the title, the path and
 * "this cannot be undone" while another document still listed the file in `dependencies:`.
 */
function renderDialog(target: DeleteDocTarget, onConfirm = vi.fn().mockResolvedValue(undefined)) {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DeleteDocDialog target={target} onCancel={vi.fn()} onConfirm={onConfirm} />
    </NextIntlClientProvider>,
  );
  return { onConfirm };
}

describe("DeleteDocDialog", () => {
  it("names the documents still pointing here before anything is removed", () => {
    renderDialog({
      slug: "capabilities/qa-probe-delete-me",
      title: "삭제 확인용 역량",
      referrers: [
        { slug: "capabilities/analysis-archive", title: "분석 기록 보관소" },
        { slug: "domains/code-evidence", title: "코드 근거" },
        { slug: "elements/a", title: "A" },
        { slug: "elements/b", title: "B" },
      ],
    });
    const dialog = screen.getByTestId("docs-delete-dialog");
    expect(dialog).toHaveAttribute("role", "alertdialog");
    const referrers = screen.getByTestId("docs-delete-referrers");
    expect(referrers).toHaveAttribute("data-count", "4");
    expect(referrers).toHaveTextContent("분석 기록 보관소");
    expect(referrers).toHaveTextContent("외 1개");
    expect(dialog).toHaveTextContent("capabilities/qa-probe-delete-me.md");
  });

  it("draws no warning for a document nothing points at", () => {
    renderDialog({ slug: "capabilities/lonely", title: "외톨이", referrers: [] });
    expect(screen.queryByTestId("docs-delete-referrers")).not.toBeInTheDocument();
  });

  it("keeps the thrown English off the page when the delete is refused", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("EACCES: permission denied, unlink"));
    renderDialog({ slug: "capabilities/x", title: "X", referrers: [] }, onConfirm);
    fireEvent.click(screen.getByTestId("docs-delete-confirm"));
    const failure = await screen.findByTestId("docs-delete-failure");
    expect(failure).toHaveTextContent(koMessages.failures["permission-denied"]);
    expect(failure.textContent).not.toContain("EACCES");
    await waitFor(() => expect(screen.getByTestId("docs-delete-confirm")).toBeEnabled());
  });
});
