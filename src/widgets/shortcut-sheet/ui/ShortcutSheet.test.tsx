import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/topology",
}));
import enMessages from "../../../../messages/en.json";
import { ShortcutSheet } from "./ShortcutSheet";

/**
 * W2-C — the "지형도"/"Relief" (topology) section used to list interactions
 * the v2 canvas never implemented (더블클릭 로컬 · Shift+클릭 경로 · Tab
 * 이웃 · / 검색 · 0 깊이). This test locks the corrected section to the
 * canvas's ACTUAL behavior so a future stale-key regression fails loudly
 * (the exact failure mode that motivated this rewrite in the first place).
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
        "Context menu — document, edit relations, copy handoff, path, full detail",
      ),
    ).toBeInTheDocument();
  });
});

/**
 * P1a-2 (persona 실측 N8 — 도메인/역량/요소 정의가 작업 UI 0곳). Locks the
 * one-line kind glossary added to this sheet's footer instead of a new
 * surface.
 */
describe("ShortcutSheet — kind glossary (P1a-2)", () => {
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


// #67 — 40여 행을 2열로 한 번에 쏟아 1512×900 에서 다이얼로그가 뷰포트의 95%
// (852px)를 먹고 하단이 잘렸다. 해법은 **숨기기가 아니라 분류** — `전체` 탭이
// 종전 목록을 그대로 유지하므로 발견 가능성을 잃지 않는다.
describe("ShortcutSheet — 문맥 탭 (#67)", () => {
  it("기본은 '지금 화면' — 지도에서는 문서함 섹션이 나오지 않는다", () => {
    renderSheet();

    expect(screen.getByTestId("shortcut-sheet-scope-current")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // 지도 표면 + 전역은 보인다.
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    // 문서함 전용 섹션은 이 탭에 없다.
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.docsPalette),
    ).not.toBeInTheDocument();
  });

  it("'전체' 탭은 모든 섹션을 되살린다 — 단축키를 숨겨 과밀을 회피하지 않는다", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-all"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsGraph)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology)).toBeInTheDocument();
  });

  it("문서함 탭에서도 전역 단축키는 남는다 — 지금 누를 수 있는 키가 사라지면 안 된다", () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-docs"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.topology),
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
