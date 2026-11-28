import { fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { LocaleSwitch } from "./LocaleSwitch";

const mocks = vi.hoisted(() => ({
  href: "/en/",
  replace: vi.fn(),
  buildLocation: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

// The router answers with the address of the screen on show in the language it is asked for.
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ buildLocation: mocks.buildLocation }),
}));

function renderSwitch(onSwitchStart?: (nextLocale: string) => void) {
  return render(
    <IntlProvider locale="en" messages={enMessages}>
      <LocaleSwitch onSwitchStart={onSwitchStart} />
    </IntlProvider>,
  );
}

describe("LocaleSwitch", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.buildLocation.mockReset();
    mocks.buildLocation.mockImplementation(({ params }: { params: (previous: object) => { locale: string } }) => ({
      href: mocks.href.replace(/^\/en\//, `/${params({ locale: "en" }).locale}/`),
    }));
    window.localStorage.clear();
    mocks.href = "/en/";
  });

  it("replaces only the locale while keeping the current review state", () => {
    mocks.href = "/en/architecture/?tab=freshness&tag=a&tag=b#recent";
    renderSwitch();

    fireEvent.click(screen.getByRole("radio", { name: "KO 한국어" }));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/architecture/?tab=freshness&tag=a&tag=b#recent",
      { locale: "ko", scroll: false },
    );
    expect(mocks.buildLocation).toHaveBeenCalledWith(expect.objectContaining({ to: ".", search: true, hash: true }));
    expect(window.localStorage.getItem("ontology-atlas:locale")).toBe("ko");
  });

  it("reports the target locale before navigation so the host can preserve focus continuity", () => {
    const onSwitchStart = vi.fn();
    renderSwitch(onSwitchStart);

    fireEvent.click(screen.getByRole("radio", { name: "KO 한국어" }));

    expect(onSwitchStart).toHaveBeenCalledWith("ko");
    expect(onSwitchStart.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.replace.mock.invocationCallOrder[0],
    );
  });

  it("skips locales that have no registered name", () => {
    render(
      <IntlProvider locale="en" messages={enMessages}>
        <LocaleSwitch locales={["en", "ko", "fr"]} />
      </IntlProvider>,
    );
    expect(screen.getAllByRole("radio").map((node) => node.textContent)).toEqual(["EN", "KO"]);
  });
});
