import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { SearchHint } from "./SearchHint";

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("SearchHint", () => {
  it("keeps the 3D picker name and describes the current map view in Help", () => {
    window.localStorage.setItem("atlas.appearance.view3d", "on");
    window.localStorage.setItem("atlas.appearance.map-arrangement", "coupling");

    render(<SearchHint onOpenSearch={vi.fn()} onRelayout={vi.fn()} />);

    const picker = screen.getByTestId("topology-view-3d");
    expect(picker).toHaveAccessibleName("3D view");
    expect(picker).toHaveAttribute(
      "title",
      "Choose a map view. Current: Cloud.",
    );
  });

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

  it("offers one visible global expand/collapse action and reports the requested state", () => {
    const onToggleExpandAll = vi.fn();
    const { rerender } = render(
      <SearchHint
        onOpenSearch={vi.fn()}
        onRelayout={vi.fn()}
        onToggleExpandAll={onToggleExpandAll}
        allExpanded={false}
      />,
    );
    const action = screen.getByTestId("topology-expand-all");
    expect(action).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(action);
    expect(onToggleExpandAll).toHaveBeenCalledTimes(1);

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SearchHint
          onOpenSearch={vi.fn()}
          onRelayout={vi.fn()}
          onToggleExpandAll={onToggleExpandAll}
          allExpanded
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("topology-expand-all")).toHaveAttribute("aria-pressed", "true");
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

  it("can suppress the focus lane below xl while keeping wide-screen utility access", () => {
    // At 1024px the right two-row lane and detail panel overlapped, widening the downgrade zone to xl.
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
      "hidden-below-xl-while-node-popover-owns-focus",
    );
    expect(lane).toHaveClass("hidden");
    expect(lane).toHaveClass("xl:block");
  });

  it("demotes below md while the expanded INDEX sheet owns the surface", () => {
    // Below `md` the expanded INDEX is a full-bleed sheet — while the sheet is the
    // primary surface the chrome column withdraws (the same contract as the utility
    // lane's hidden md:flex).
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
    expect(lane).toHaveClass("xl:block");
    expect(lane).not.toHaveClass("md:block");
  });

  it("marks a visible right inspector so the wide lane can recenter in the remaining map", () => {
    render(
      <SearchHint
        rightInspectorReserved
        onOpenSearch={vi.fn()}
        onRelayout={vi.fn()}
      />,
    );

    const lane = screen.getByTestId("topology-search-action-lane");
    expect(lane).toHaveAttribute(
      "data-right-inspector-reserve",
      "recenter-in-remaining-map",
    );
    expect(lane).toHaveClass("transition-[left]");
  });
});

/**
 * The lane is centred in the map, but the INDEX panel is an overlay -- so with the
 * panel expanded, `left-1/2` centred the chip column over the panel and the first
 * chip sat underneath it (owner report, 2026-08-24). Reserving the panel width
 * moves the column into the map that is actually visible.
 */
describe('SearchHint — INDEX 패널 자리 확보', () => {
  it('패널이 펼쳐지면 남은 지도 기준으로 다시 가운데 정렬한다', () => {
    render(<SearchHint onOpenSearch={vi.fn()} onRelayout={vi.fn()} leftIndexReserved />);
    const lane = screen.getByTestId('topology-search-action-lane');
    expect(lane).toHaveAttribute('data-left-index-reserve', 'recenter-in-remaining-map');
    expect(lane.className).toContain('xl:left-[calc(50%+var(--topology-index-width)/2)]');
  });

  it('패널이 접혀 있으면 지도 전체 기준 가운데를 유지한다', () => {
    render(<SearchHint onOpenSearch={vi.fn()} onRelayout={vi.fn()} />);
    const lane = screen.getByTestId('topology-search-action-lane');
    expect(lane).not.toHaveAttribute('data-left-index-reserve');
    expect(lane.className).toContain('xl:left-1/2');
  });
});
