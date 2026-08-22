import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/topology",
}));
import enMessages from "../../../../messages/en.json";
import { ShortcutSheet } from "./ShortcutSheet";

/**
 * W2-C — the "지형도"/"Relief" (topology) section used to list interactions the v2
 * canvas never implemented (double-click local · Shift+click path · Tab neighbours ·
 * / search · 0 depth). This test locks the corrected section to the canvas's ACTUAL
 * behavior so a future stale-key regression fails loudly (the exact failure mode that
 * motivated this rewrite in the first place).
 */
function renderSheet() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutSheet open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("ShortcutSheet — topology section (W2-C)", () => {
  it("no longer lists the unimplemented double-click/shift-click/tab/slash/depth interactions", () => {
    renderSheet();
    expect(screen.queryByText(/Show only neighbors of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Highlight the shortest path between two nodes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Move to a neighbor of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Focus the graph search input/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clear the depth filter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Limit to N hops/i)).not.toBeInTheDocument();
  });

  it("lists the real canvas interactions: click select, drag pan/move, wheel zoom, ⌘K search, Esc, right-click menu", () => {
    renderSheet();
    expect(screen.getByText("Select a node")).toBeInTheDocument();
    expect(
      screen.getByText("Pan the map (empty space) or move a node (spring rebound)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Zoom in or out")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Context menu.*edit relations.*copy handoff/,
      ),
    ).toBeInTheDocument();
  });
});

/**
 * P1a-2 (persona measurement N8 — the definitions of domain/capability/element
 * appeared in 0 working UIs). Locks the one-line kind glossary added to this sheet's
 * footer instead of a new surface.
 */
describe("ShortcutSheet — kind glossary (P1a-2)", () => {
  /**
   * A word baked into the product's name that was defined in 0 places inside the app.
   * Once the tour names it, this is where it is recovered, so it comes before the
   * three kinds.
   */
  it("defines ontology first, before the three kinds", () => {
    renderSheet();
    expect(screen.getByText("Ontology")).toBeInTheDocument();
    expect(
      screen.getByText(
        /documents recording what exists and how it connects/,
      ),
    ).toBeInTheDocument();

    const text = screen.getByText("Words used on the map").parentElement?.textContent ?? "";
    expect(text.indexOf("Ontology")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Ontology")).toBeLessThan(text.indexOf("Domain"));
  });

  it("defines domain/capability/element in one line each", () => {
    renderSheet();
    expect(screen.getByText("Words used on the map")).toBeInTheDocument();
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByText("A large area that groups features")).toBeInTheDocument();
    expect(screen.getByText("Capability")).toBeInTheDocument();
    expect(screen.getByText("One thing a user can do")).toBeInTheDocument();
    expect(screen.getByText("Element")).toBeInTheDocument();
    expect(
      screen.getByText("A piece of code or a doc that implements it"),
    ).toBeInTheDocument();
  });
});


// #67 — pouring some 40 rows into two columns at once made the dialog eat 95% of the
// viewport (852px) at 1512×900 with the bottom cut off. The answer is **classification,
// not hiding** — the `전체` (all) tab keeps the previous list, so discoverability is not lost.
describe("ShortcutSheet — 문맥 탭 (#67)", () => {
  it("기본은 '지금 화면' — 지도에서는 문서함 섹션이 나오지 않는다", () => {
    renderSheet();

    expect(screen.getByTestId("shortcut-sheet-scope-current")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The map surface plus global are visible.
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    // The docs-vault-only sections are not on this tab.
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.docsPalette),
    ).not.toBeInTheDocument();
  });

  it("'전체' 탭은 모든 섹션을 되살린다 — 단축키를 숨겨 과밀을 회피하지 않는다", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-all"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsGraph)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" })).toBeInTheDocument();
  });

  it("문서함 탭에서도 전역 단축키는 남는다 — 지금 누를 수 있는 키가 사라지면 안 된다", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-docs"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" }),
    ).not.toBeInTheDocument();
  });

  it("탭 바와 닫기 버튼은 스크롤 영역 밖에 고정된다", () => {
    renderSheet();
    const tabs = screen.getByTestId("shortcut-sheet-scope-tabs");
    const scroll = screen.getByTestId("shortcut-sheet-scroll");

    expect(scroll.contains(tabs)).toBe(false);
    expect(scroll.contains(screen.getByTestId("shortcut-sheet-close"))).toBe(false);
  });

  it("스크롤 여지를 알리는 아래쪽 페이드가 있다", () => {
    renderSheet();
    expect(screen.getByTestId("shortcut-sheet-scroll-fade")).toBeInTheDocument();
  });
});

// #67 follow-up — the scroll area has to be genuinely **constrained**.
//
// Measured regression (English `전체` tab, 1512×806): adding the fade wrapper used
// `h-full` on the scrolling div, and inside a wrapper whose height came from flex
// (526px) that percentage resolved against the content height (1112px), making
// `scrollHeight === clientHeight`. The result: the scroll died and the last section
// was cut outside the viewport (1256px). jsdom does not compute layout, so this
// cannot be caught by height — the **deterministic anchoring method** is pinned as a
// contract instead.
describe("ShortcutSheet — 스크롤 영역 높이 계약 (#67)", () => {
  it("스크롤 영역을 래퍼에 absolute 로 못박는다 — `h-full` 퍼센트 해석에 의존하지 않는다", () => {
    renderSheet();
    const scroll = screen.getByTestId("shortcut-sheet-scroll");

    // Constrained with flex inside the flow — it takes only the remaining space and scrolls the rest.
    expect(scroll.className).toContain("min-h-0");
    expect(scroll.className).toContain("flex-1");
    expect(scroll.className).toContain("overflow-y-auto");
    // `h-full` resolved against the content height and killed the scroll (1112px), and
    // `absolute` dropped out of flow and collapsed the dialog to 232px. Both forbidden.
    expect(scroll.className).not.toContain("h-full");
    expect(scroll.className).not.toContain("absolute");
  });

  it("래퍼도 flex 컬럼이라 자식이 남는 높이를 정확히 받는다 (+ 페이드 앵커용 relative)", () => {
    renderSheet();
    const wrapper = screen.getByTestId("shortcut-sheet-scroll").parentElement!;

    expect(wrapper.className).toContain("relative");
    expect(wrapper.className).toContain("min-h-0");
    expect(wrapper.className).toContain("flex-1");
    expect(wrapper.className).toContain("flex-col");
  });
});
