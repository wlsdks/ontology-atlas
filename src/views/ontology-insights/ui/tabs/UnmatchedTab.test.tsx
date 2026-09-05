import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { buildUnmatchedBoard, unmatchedRowId } from "../../lib/unmatched-board";
import { UnmatchedTab, type UnmatchedTabLabels } from "./UnmatchedTab";

afterEach(cleanup);

const labels: UnmatchedTabLabels = {
  title: "Asked for, not held",
  caption: "caption",
  occurrences: (count) => `×${count}`,
  askedByPrefix: "asked by",
  writtenUnder: (keys) => `written under ${keys}`,
  dismiss: (name) => `Hide ${name}`,
  hiddenMarker: (count) => `${count} hidden · show`,
  hiddenNote: (count) => `${count} hidden`,
  pending: "Reading the folder",
  footnote: "an invented relation type is recorded nowhere",
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
  const view = render(
    <UnmatchedTab
      board={buildUnmatchedBoard({ asks: ASKS }, dismissed)}
      onDismiss={onDismiss}
      onRestoreAll={onRestoreAll}
      sourceHref={(slug) => `/docs/?slug=${slug}`}
      labels={labels}
    />,
  );
  const rerenderWith = (next: ReadonlySet<string>) =>
    view.rerender(
      <UnmatchedTab
        board={buildUnmatchedBoard({ asks: ASKS }, next)}
        onDismiss={onDismiss}
        onRestoreAll={onRestoreAll}
        sourceHref={(slug) => `/docs/?slug=${slug}`}
        labels={labels}
      />,
    );
  return { onDismiss, onRestoreAll, rerenderWith };
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

  it("puts the limit under the list, where it answers a question the list raised", () => {
    renderBoard();
    const caption = screen.getByText("caption");
    const footnote = screen.getByTestId("unmatched-footnote");
    expect(caption.compareDocumentPosition(footnote) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.getByTestId("unmatched-list").compareDocumentPosition(footnote) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("draws the count heavier than the name it qualifies", () => {
    renderBoard();
    const count = screen.getByTestId("unmatched-row-count");
    expect(count.className).toContain("font-[var(--font-weight-emphasis)]");
    expect(count.className).toContain("text-body-lg");
  });

  it("says who asked and under which keys", () => {
    renderBoard();
    const detail = screen.getAllByTestId("unmatched-row")[0].textContent ?? "";
    expect(detail).toContain(
      "asked by capabilities/invoice, capabilities/refund, domains/payment",
    );
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

  it("hides the row without moving the count the folder reported", () => {
    renderBoard(new Set([unmatchedRowId("capabilities/ledger")]));
    expect(screen.getAllByTestId("unmatched-row")).toHaveLength(1);
    expect(screen.getByTestId("unmatched-group-count").textContent).toBe("2");
  });

  it("says nothing at all when nothing is hidden", () => {
    renderBoard();
    expect(screen.queryByTestId("unmatched-restore-all")).toBeNull();
    // The live region stays mounted so a later change is announced, but holds no text.
    expect(screen.getByTestId("unmatched-hidden-note").textContent).toBe("");
  });
});

describe("UnmatchedTab — a folder with nothing missing", () => {
  it("says every name resolves rather than drawing an empty list", () => {
    render(
      <UnmatchedTab
        board={buildUnmatchedBoard({ asks: [] }, new Set())}
        onDismiss={vi.fn()}
        onRestoreAll={vi.fn()}
        sourceHref={(slug) => `/docs/?slug=${slug}`}
        labels={labels}
      />,
    );
    expect(screen.getByText("Every name here resolves")).toBeInTheDocument();
    expect(screen.queryAllByTestId("unmatched-list")).toHaveLength(0);
  });
});

describe("UnmatchedTab — a folder that has not been read yet", () => {
  /*
   * ⚠️ **"Nothing is missing" and "nothing has been read" are opposite facts.** While the
   * manifest is still null the list has no answer, and the empty state asserts one — the
   * most reassuring sentence on the tab, shown at the one moment it cannot be true.
   */
  it("says it is still reading rather than claiming every name resolves", () => {
    render(
      <UnmatchedTab
        board={buildUnmatchedBoard({ asks: [] }, new Set())}
        pending
        onDismiss={vi.fn()}
        onRestoreAll={vi.fn()}
        sourceHref={(slug) => `/docs/?slug=${slug}`}
        labels={labels}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status.textContent).toContain("Reading the folder");
    expect(screen.queryByText("Every name here resolves")).toBeNull();
  });
});

describe("UnmatchedTab — hidden rows are marked where the count is", () => {
  it("puts the marker beside the eyebrow count, not in a footer", () => {
    renderBoard(new Set([unmatchedRowId("capabilities/ledger")]));
    const marker = screen.getByTestId("unmatched-restore-all");
    expect(marker.textContent).toBe("1 hidden · show");
    const eyebrow = screen.getByTestId("unmatched-group-count");
    expect(eyebrow.parentElement).toBe(marker.parentElement);
  });

  it("announces the hidden count once, politely", () => {
    renderBoard(new Set([unmatchedRowId("capabilities/ledger")]));
    const live = screen.getByTestId("unmatched-hidden-note");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live.textContent).toContain("1 hidden");
  });

  it("keeps the marker and drops the empty list when every row is hidden", () => {
    renderBoard(new Set(ASKS.map((ask) => unmatchedRowId(ask.ref))));
    expect(screen.getByTestId("unmatched-restore-all").textContent).toBe("2 hidden · show");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByTestId("unmatched-group-count").textContent).toBe("2");
    // Not the empty state: the folder still holds two missing names.
    expect(screen.queryByText("Every name here resolves")).toBeNull();
  });
});

describe("UnmatchedTab — the keyboard never lands nowhere", () => {
  it("moves focus to the next row after dismissing one", () => {
    const { rerenderWith } = renderBoard();
    const buttons = screen.getAllByTestId("unmatched-dismiss");
    buttons[0].focus();
    fireEvent.click(buttons[0]);
    rerenderWith(new Set([unmatchedRowId("capabilities/holds-position")]));
    expect(document.activeElement).toBe(screen.getByTestId("unmatched-dismiss"));
  });

  it("falls back to the previous row when the last one goes", () => {
    const { rerenderWith } = renderBoard();
    const buttons = screen.getAllByTestId("unmatched-dismiss");
    buttons[1].focus();
    fireEvent.click(buttons[1]);
    rerenderWith(new Set([unmatchedRowId("capabilities/ledger")]));
    expect(document.activeElement).toBe(screen.getByTestId("unmatched-dismiss"));
  });

  it("falls back to the heading when the last visible row goes", () => {
    const { rerenderWith } = renderBoard(
      new Set([unmatchedRowId("capabilities/ledger")]),
    );
    const button = screen.getByTestId("unmatched-dismiss");
    button.focus();
    fireEvent.click(button);
    rerenderWith(new Set(ASKS.map((ask) => unmatchedRowId(ask.ref))));
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(heading);
  });

  it("moves focus into the list again after restoring", () => {
    const { rerenderWith } = renderBoard(
      new Set(ASKS.map((ask) => unmatchedRowId(ask.ref))),
    );
    fireEvent.click(screen.getByTestId("unmatched-restore-all"));
    rerenderWith(new Set());
    expect(document.activeElement).toBe(screen.getAllByTestId("unmatched-dismiss")[0]);
  });
});

describe("UnmatchedTab — who asked is reachable", () => {
  it("links each asking concept to its document", () => {
    renderBoard();
    const link = screen.getByRole("link", { name: "capabilities/refund" });
    expect(link).toHaveAttribute("href", "/docs/?slug=capabilities/refund");
  });
});
