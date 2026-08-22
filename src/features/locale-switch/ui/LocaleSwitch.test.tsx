import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { buildLocaleTarget, LocaleSwitch } from "./LocaleSwitch";

const mocks = vi.hoisted(() => ({
  pathname: "/en/",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

function renderSwitch(onSwitchStart?: (nextLocale: string) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocaleSwitch onSwitchStart={onSwitchStart} />
    </NextIntlClientProvider>,
  );
}

describe("LocaleSwitch", () => {
  beforeEach(() => {
    mocks.pathname = "/en/";
    mocks.replace.mockReset();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/en/");
  });

  it("keeps locale buttons large enough for first-viewport touch", () => {
    renderSwitch();

    // After the SegmentedControl migration (2026-08-15) the size comes from the value layer:
    // `min-h-8` (32px) plus `atlas-touch-floor` (promoted to 44 on coarse pointers — a real
    // height, not a phantom hit area).
    expect(screen.getByRole("radio", { name: "EN English" }).className).toContain(
      "min-h-8",
    );
    expect(screen.getByRole("radio", { name: "KO 한국어" }).className).toContain(
      "atlas-touch-floor",
    );
  });

  it("preserves raw query order, duplicate keys, encoded values, and the hash", () => {
    expect(
      buildLocaleTarget(
        "/ko/ontology/insights/",
        "ko",
        "en",
        "?tab=freshness&tag=a&tag=b&node=%ED%95%9C%EA%B8%80%2Ffact",
        "#recent",
      ),
    ).toBe(
      "/en/ontology/insights/?tab=freshness&tag=a&tag=b&node=%ED%95%9C%EA%B8%80%2Ffact#recent",
    );
  });

  it.each([
    ["/en", "/ko"],
    ["/en/", "/ko/"],
    ["/", "/ko/"],
    ["/ontology/insights/", "/ko/ontology/insights/"],
  ])("keeps the trailing-slash contract for %s", (pathname, expected) => {
    expect(buildLocaleTarget(pathname, "en", "ko")).toBe(expected);
  });

  it("replaces only the locale while keeping the current review state", () => {
    mocks.pathname = "/en/ontology/insights/";
    window.history.replaceState(
      {},
      "",
      "/en/ontology/insights/?tab=freshness&tag=a&tag=b#recent",
    );
    renderSwitch();

    fireEvent.click(screen.getByRole("radio", { name: "KO 한국어" }));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/ko/ontology/insights/?tab=freshness&tag=a&tag=b#recent",
      { scroll: false },
    );
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
});
