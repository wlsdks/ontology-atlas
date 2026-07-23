import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { SearchHint } from "./SearchHint";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SearchHint", () => {
  it("exposes utility-lane token contracts on search and auto-arrange actions", () => {
    const onOpenSearch = vi.fn();
    const onRelayout = vi.fn();

    render(<SearchHint onOpenSearch={onOpenSearch} onRelayout={onRelayout} />);

    const lane = screen.getByTestId("topology-search-action-lane");
    expect(lane).toHaveAttribute("data-search-lane-density", "default");
    expect(lane).toHaveAttribute(
      "data-search-lane-surface-token",
      "--chrome-surface",
    );

    const arrange = screen.getByTestId("topology-auto-arrange");
    const search = screen.getByTestId("topology-concept-search");
    for (const action of [arrange, search]) {
      expect(action).toHaveAttribute(
        "data-utility-action-token-contract",
        "support-surface-family",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-surface-token",
        "--chrome-surface",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-border-token",
        "--chrome-border",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-hover-surface-token",
        "--color-overlay-2",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-shadow-token",
        "--chrome-shadow",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-focus-ring-token",
        "--color-indigo-accent",
      );
    }
    expect(arrange).toHaveAttribute(
      "data-utility-action-active-surface-token",
      "--chrome-active-surface",
    );
    expect(arrange).toHaveAttribute(
      "data-utility-action-active-border-token",
      "--chrome-active-border",
    );

    fireEvent.click(search);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(arrange);
    expect(onRelayout).toHaveBeenCalledTimes(1);
    expect(arrange).toHaveAttribute("data-arranging", "true");
  });

  it("keeps compact focus density icon-first while preserving action token markers", () => {
    render(<SearchHint density="compact-focus" onOpenSearch={vi.fn()} onRelayout={vi.fn()} />);

    expect(screen.getByTestId("topology-search-action-lane")).toHaveAttribute(
      "data-search-lane-contract",
      "icon-first-focus-search",
    );
    expect(screen.getByTestId("topology-auto-arrange")).toHaveAttribute(
      "data-utility-action-focus-ring-token",
      "--color-indigo-accent",
    );
    expect(screen.getByTestId("topology-concept-search")).toHaveAttribute(
      "data-utility-action-focus-ring-token",
      "--color-indigo-accent",
    );
  });

  it("can suppress the focus lane below lg while keeping desktop utility access", () => {
    // 겹침 소탕 2026-07-23 — 노드 팝오버가 <lg 에서 상단 중앙(fixed inset-x-3
    // top-[72px])을 차지하고, 이 레인도 <lg 우측 2행으로 내려왔으므로 focus
    // 강등 구간이 <md → <lg 로 확장됐다.
    render(
      <SearchHint
        density="compact-focus"
        phoneFocusSuppressed
        onOpenSearch={vi.fn()}
        onRelayout={vi.fn()}
      />,
    );

    const lane = screen.getByTestId("topology-search-action-lane");
    expect(lane).toHaveAttribute(
      "data-phone-focus-utility-contract",
      "hidden-below-lg-while-node-popover-owns-focus",
    );
    expect(lane).toHaveClass("hidden");
    expect(lane).toHaveClass("lg:block");
  });

  it("demotes below md while the expanded INDEX sheet owns the surface", () => {
    // <md 확장 INDEX 는 풀-블리드 시트 — 시트가 주 표면인 동안 크롬 열은
    // 물러난다 (utility lane 의 hidden md:flex 와 같은 계약).
    render(
      <SearchHint phoneSheetSuppressed onOpenSearch={vi.fn()} onRelayout={vi.fn()} />,
    );

    const lane = screen.getByTestId("topology-search-action-lane");
    expect(lane).toHaveAttribute(
      "data-phone-sheet-utility-contract",
      "hidden-below-md-while-index-sheet-owns-surface",
    );
    expect(lane).toHaveClass("hidden");
    expect(lane).toHaveClass("md:block");
  });

  it("lets the stricter focus suppression win when both suppressions are active", () => {
    render(
      <SearchHint
        phoneFocusSuppressed
        phoneSheetSuppressed
        onOpenSearch={vi.fn()}
        onRelayout={vi.fn()}
      />,
    );

    const lane = screen.getByTestId("topology-search-action-lane");
    expect(lane).toHaveClass("hidden");
    expect(lane).toHaveClass("lg:block");
    expect(lane).not.toHaveClass("md:block");
  });
});
