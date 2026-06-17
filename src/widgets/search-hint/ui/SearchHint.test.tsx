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
      "--topology-utility-lane-surface",
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
        "--topology-utility-lane-surface",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-border-token",
        "--topology-utility-lane-border",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-hover-surface-token",
        "--topology-utility-lane-hover-surface",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-active-surface-token",
        "--topology-utility-lane-accent-surface",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-shadow-token",
        "--topology-utility-lane-shadow",
      );
      expect(action).toHaveAttribute(
        "data-utility-action-focus-ring-token",
        "--topology-utility-lane-focus-ring",
      );
    }
    expect(arrange).toHaveAttribute(
      "data-utility-action-active-border-token",
      "--topology-utility-lane-accent-border",
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
      "--topology-utility-lane-focus-ring",
    );
    expect(screen.getByTestId("topology-concept-search")).toHaveAttribute(
      "data-utility-action-focus-ring-token",
      "--topology-utility-lane-focus-ring",
    );
  });
});
