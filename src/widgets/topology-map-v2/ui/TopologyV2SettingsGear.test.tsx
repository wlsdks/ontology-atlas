import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { TopologyV2SettingsGear } from "./TopologyV2SettingsGear";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/",
  useRouter: () => ({ replace: vi.fn() }),
}));

const labels = {
  trigger: "Settings",
  heading: "Map settings",
  locale: "Language",
  theme: "Theme",
  indexDefault: "INDEX default state",
  indexDefaultExpanded: "Expanded",
  indexDefaultCollapsed: "Collapsed",
};

function renderGear(
  onChangeIndexDefaultCollapsed: (next: boolean) => void = () => {},
  indexDefaultCollapsed = false,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <TopologyV2SettingsGear
        indexDefaultCollapsed={indexDefaultCollapsed}
        onChangeIndexDefaultCollapsed={onChangeIndexDefaultCollapsed}
        labels={labels}
      />
    </NextIntlClientProvider>,
  );
}

describe("TopologyV2SettingsGear — utility-rail settings popover", () => {
  it("keeps the popover closed until the trigger is clicked", () => {
    renderGear();
    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
  });

  it("opens the popover with locale/theme/index-default rows on trigger click", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    const popover = screen.getByTestId("topology-v2-settings-gear-popover");
    expect(popover).toBeInTheDocument();
    expect(within(popover).getByText(labels.locale)).toBeInTheDocument();
    expect(within(popover).getByText(labels.theme)).toBeInTheDocument();
    expect(within(popover).getByText(labels.indexDefault)).toBeInTheDocument();
  });

  it("calls onChangeIndexDefaultCollapsed(true) when the collapsed option is picked", () => {
    const onChange = vi.fn();
    renderGear(onChange, false);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.indexDefaultCollapsed }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls onChangeIndexDefaultCollapsed(false) when the expanded option is picked", () => {
    const onChange = vi.fn();
    renderGear(onChange, true);
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    fireEvent.click(screen.getByRole("button", { name: labels.indexDefaultExpanded }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape and stops the keypress from reaching the window (transient-surface-first)", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    const windowHandler = vi.fn();
    window.addEventListener("keydown", windowHandler);
    fireEvent.keyDown(screen.getByTestId("topology-v2-settings-gear-popover"), {
      key: "Escape",
      bubbles: true,
    });
    window.removeEventListener("keydown", windowHandler);

    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
    expect(windowHandler).not.toHaveBeenCalled();
  });

  it("closes on outside click", () => {
    renderGear();
    fireEvent.click(screen.getByTestId("topology-v2-settings-gear-trigger"));
    expect(screen.getByTestId("topology-v2-settings-gear-popover")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("topology-v2-settings-gear-popover")).not.toBeInTheDocument();
  });
});
