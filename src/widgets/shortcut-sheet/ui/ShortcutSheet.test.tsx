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
        /Context menu.*edit relations.*copy handoff/,
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
  /**
   * 제품 이름에 박힌 단어인데 앱 안에서 정의되는 자리가 0곳이었다. 투어에서
   * 한 번 이름을 붙인 뒤 되찾아 볼 곳이 여기라서, 세 kind 앞에 먼저 온다.
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
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" })).toBeInTheDocument();
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

// #67 후속 — 스크롤 영역이 실제로 **제한**돼야 한다.
//
// 실측 회귀(영문 `전체` 탭, 1512×806): 페이드 래퍼를 넣을 때 스크롤 div 에
// `h-full` 을 썼는데, flex 로 높이가 정해진 래퍼(526px) 안에서 그 퍼센트가
// 콘텐츠 높이(1112px)로 해석돼 `scrollHeight === clientHeight` 가 됐다. 결과:
// 스크롤이 죽고 마지막 섹션이 뷰포트 밖(1256px)으로 잘렸다. jsdom 은 레이아웃을
// 계산하지 않으므로 높이로는 못 잡는다 — **결정적인 앵커 방식**을 계약으로 잠근다.
describe("ShortcutSheet — 스크롤 영역 높이 계약 (#67)", () => {
  it("스크롤 영역을 래퍼에 absolute 로 못박는다 — `h-full` 퍼센트 해석에 의존하지 않는다", () => {
    renderSheet();
    const scroll = screen.getByTestId("shortcut-sheet-scroll");

    // 흐름 안에서 flex 로 제한한다 — 남는 공간만 먹고 나머지는 스크롤.
    expect(scroll.className).toContain("min-h-0");
    expect(scroll.className).toContain("flex-1");
    expect(scroll.className).toContain("overflow-y-auto");
    // `h-full` 은 콘텐츠 높이로 해석돼 스크롤을 죽였고(1112px),
    // `absolute` 는 흐름에서 빠져 다이얼로그를 232px 로 무너뜨렸다. 둘 다 금지.
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
