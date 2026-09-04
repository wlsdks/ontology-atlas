import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildUnmatchedBoard } from "../../lib/unmatched-board";
import { UnmatchedTab, type UnmatchedTabLabels } from "./UnmatchedTab";

afterEach(cleanup);

const labels: UnmatchedTabLabels = {
  title: "Asked for, not held",
  caption: "caption",
  kindTitle: (kind) => `title:${kind}`,
  kindCaption: (kind) => `caption:${kind}`,
  occurrences: (count) => `×${count}`,
  askedBy: (names) => `asked by ${names}`,
  shouldHold: (names) => `${names} should name it back`,
  writtenUnder: (keys) => `written under ${keys}`,
  dismiss: (name) => `Hide ${name}`,
  restoreAll: () => "Show all again",
  hiddenNote: (count) => `${count} hidden`,
  emptyTitle: "Every name here resolves",
  emptyDescription: "nothing missing",
};

const INPUT = {
  asks: [
    {
      ref: "capabilities/holds-position",
      relations: ["capabilities", "dependencies"],
      count: 3,
      sources: ["capabilities/invoice", "capabilities/refund", "domains/payment"],
    },
    { ref: "capabilities/ledger", relations: ["dependencies"], count: 1, sources: ["capabilities/invoice"] },
  ],
  missingContainment: [{ slug: "capabilities/invoice", domain: "domains/payment" }],
  unassigned: ["elements/floating"],
};

function renderBoard(dismissed: ReadonlySet<string> = new Set()) {
  const onDismiss = vi.fn();
  const onRestoreAll = vi.fn();
  render(
    <UnmatchedTab
      board={buildUnmatchedBoard(INPUT, dismissed)}
      onDismiss={onDismiss}
      onRestoreAll={onRestoreAll}
      labels={labels}
    />,
  );
  return { onDismiss, onRestoreAll };
}

describe("UnmatchedTab — the count is the point of the row", () => {
  it("draws the times a name was asked for, so a missing concept reads apart from a typo", () => {
    renderBoard();
    const counts = screen.getAllByTestId("unmatched-row-count").map((el) => el.textContent);
    // Only the name more than one node reached for carries a multiplier.
    expect(counts).toEqual(["×3"]);
  });

  it("keeps the three kinds in separate groups, each with the vault's own count", () => {
    renderBoard();
    const groups = screen.getAllByTestId("unmatched-group");
    expect(groups.map((el) => el.getAttribute("data-unmatched-kind"))).toEqual([
      "unresolved-reference",
      "missing-containment",
      "unassigned-node",
    ]);
    expect(
      screen.getAllByTestId("unmatched-group-count").map((el) => el.textContent),
    ).toEqual(["2", "1", "1"]);
  });

  it("says who asked, and for a one-sided placement who should have named it back", () => {
    renderBoard();
    expect(
      screen.getByText(
        "asked by capabilities/invoice, capabilities/refund, domains/payment",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("domains/payment should name it back")).toBeInTheDocument();
    expect(screen.getByText("written under capabilities, dependencies")).toBeInTheDocument();
  });
});

describe("UnmatchedTab — dismissing hides, and the screen says so", () => {
  it("hands the row id up rather than deciding for itself", () => {
    const { onDismiss } = renderBoard();
    fireEvent.click(screen.getAllByTestId("unmatched-dismiss")[0]);
    expect(onDismiss).toHaveBeenCalledWith(
      "unresolved-reference:capabilities/holds-position",
    );
  });

  it("keeps the group count at what the vault says while the row is hidden", () => {
    renderBoard(new Set(["unresolved-reference:capabilities/ledger"]));
    expect(screen.queryByText("capabilities/ledger")).toBeNull();
    // Two names are still missing from this folder; one of them is merely not drawn.
    expect(
      screen.getAllByTestId("unmatched-group-count")[0].textContent,
    ).toBe("2");
    expect(screen.getByTestId("unmatched-hidden-note").textContent).toContain("1 hidden");
  });

  it("offers one control to bring every hidden row back", () => {
    const { onRestoreAll } = renderBoard(new Set(["unassigned-node:elements/floating"]));
    fireEvent.click(screen.getByTestId("unmatched-restore-all"));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
  });

  it("shows no hidden note when nothing is hidden", () => {
    renderBoard();
    expect(screen.queryByTestId("unmatched-hidden-note")).toBeNull();
  });
});

describe("UnmatchedTab — a folder with nothing missing", () => {
  it("says every name resolves rather than drawing empty groups", () => {
    render(
      <UnmatchedTab
        board={buildUnmatchedBoard(
          { asks: [], missingContainment: [], unassigned: [] },
          new Set(),
        )}
        onDismiss={vi.fn()}
        onRestoreAll={vi.fn()}
        labels={labels}
      />,
    );
    expect(screen.getByText("Every name here resolves")).toBeInTheDocument();
    expect(screen.queryAllByTestId("unmatched-group")).toHaveLength(0);
  });
});
