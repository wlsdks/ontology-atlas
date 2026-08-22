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
    // Overlap sweep 2026-07-23 — the node popover takes the top centre below `lg`
    // (fixed inset-x-3 top-[72px]) and this lane also drops to the right in 2 rows
    // below `lg`, so the focus-demotion band widened from <md to <lg.
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
    expect(lane).toHaveClass("lg:block");
    expect(lane).not.toHaveClass("md:block");
  });
});
