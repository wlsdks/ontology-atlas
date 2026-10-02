import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "ko", "ja", "zh"], defaultLocale: "en" },
}));

import { StandaloneLocaleProvider, useStandaloneLocale } from "./standalone-locale";

function Probe() {
  return <span data-testid="locale">{useStandaloneLocale()}</span>;
}

afterEach(() => {
  window.history.pushState({}, "", "/");
  document.documentElement.lang = "";
});

describe("standalone locale over a four-locale list", () => {
  it.each([
    ["/ja/nope/", "ja"],
    ["/ko/nope/", "ko"],
    ["/fr/nope/", "en"],
    ["/", "en"],
  ])("%s resolves to %s and sets <html lang>", (path, locale) => {
    window.history.pushState({}, "", path);
    const { getByTestId } = render(
      <StandaloneLocaleProvider messages={{ en: {}, ko: {} }}>
        <Probe />
      </StandaloneLocaleProvider>,
    );
    expect(getByTestId("locale").textContent).toBe(locale);
    expect(document.documentElement.lang).toBe(locale);
  });
});
