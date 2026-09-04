import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildUnmatchedBoard, unmatchedRowId } from "../../lib/unmatched-board";
import { UnmatchedTab, type UnmatchedTabLabels } from "./UnmatchedTab";

afterEach(cleanup);

const labels: UnmatchedTabLabels = {
  title: "Asked for, not held",
  caption: "caption",
  occurrences: (count) => `×${count}`,
  askedBy: (names) => `asked by ${names}`,
  writtenUnder: (keys) => `written under ${keys}`,
  dismiss: (name) => `Hide ${name}`,
  restoreAll: () => "Show all again",
  hiddenNote: (count) => `${count} hidden`,
  emptyTitle: "Every name here resolves",
  emptyDescription: "nothing missing",
};

const ASKS = [
  {
    ref: "capabilities/holds-position",
    relations: ["capabilities", "dependencies"],
    count: 3,
    sources: ["capabilities/invoice", "capabilities/refund", "domains/payment"],
  },
  {
    ref: "capabilities/ledger",
    relations: ["dependencies"],
    count: 1,
    sources: ["capabilities/invoice"],
  },
];

function renderBoard(dismissed: ReadonlySet<string> = new Set()) {
  const onDismiss = vi.fn();
  const onRestoreAll = vi.fn();
  render(
    <UnmatchedTab
      board={buildUnmatchedBoard({ asks: ASKS }, dismissed)}
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
    // Only the name more than one concept reached for carries a multiplier.
    expect(
      screen.getAllByTestId("unmatched-row-count").map((el) => el.textContent),
    ).toEqual(["×3"]);
  });

  it("is one list, not a set of grouped panels", () => {
    renderBoard();
    expect(screen.getAllByTestId("unmatched-list")).toHaveLength(1);
    expect(screen.getByTestId("unmatched-group-count").textContent).toBe("2");
  });

  it("says who asked and under which keys", () => {
    renderBoard();
    expect(
      screen.getByText(
        "asked by capabilities/invoice, capabilities/refund, domains/payment",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("written under capabilities, dependencies")).toBeInTheDocument();
  });
});

describe("UnmatchedTab — dismissing hides, and the screen says so", () => {
  it("hands the row id up rather than deciding for itself", () => {
    const { onDismiss } = renderBoard();
    fireEvent.click(screen.getAllByTestId("unmatched-dismiss")[0]);
    expect(onDismiss).toHaveBeenCalledWith(
      unmatchedRowId("capabilities/holds-position"),
    );
  });

  it("keeps the list count at what the folder says while a row is hidden", () => {
    renderBoard(new Set([unmatchedRowId("capabilities/ledger")]));
    expect(screen.queryByText("capabilities/ledger")).toBeNull();
    // Two names are still missing from this folder; one of them is merely not drawn.
    expect(screen.getByTestId("unmatched-group-count").textContent).toBe("2");
    expect(screen.getByTestId("unmatched-hidden-note").textContent).toContain("1 hidden");
  });

  it("offers one control to bring every hidden row back", () => {
    const { onRestoreAll } = renderBoard(
      new Set([unmatchedRowId("capabilities/ledger")]),
    );
    fireEvent.click(screen.getByTestId("unmatched-restore-all"));
    expect(onRestoreAll).toHaveBeenCalledTimes(1);
  });

  it("shows no hidden note when nothing is hidden", () => {
    renderBoard();
    expect(screen.queryByTestId("unmatched-hidden-note")).toBeNull();
  });
});

describe("UnmatchedTab — a folder with nothing missing", () => {
  it("says every name resolves rather than drawing an empty list", () => {
    render(
      <UnmatchedTab
        board={buildUnmatchedBoard({ asks: [] }, new Set())}
        onDismiss={vi.fn()}
        onRestoreAll={vi.fn()}
        labels={labels}
      />,
    );
    expect(screen.getByText("Every name here resolves")).toBeInTheDocument();
    expect(screen.queryAllByTestId("unmatched-list")).toHaveLength(0);
  });
});
