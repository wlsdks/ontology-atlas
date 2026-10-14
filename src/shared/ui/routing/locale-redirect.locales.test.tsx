import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/i18n/routing", () => ({
  routing: { locales: ["en", "ko", "ja", "zh"], defaultLocale: "en" },
}));

import { LocaleRedirect } from "./locale-redirect";

const replace = vi.fn();
const original = window.location;

function setLanguages(languages: string[]) {
  Object.defineProperty(window.navigator, "languages", { value: languages, configurable: true });
}

beforeEach(() => {
  Object.defineProperty(window, "location", {
    value: { search: "?p=1", hash: "#x", replace },
    configurable: true,
  });
  window.localStorage.clear();
});

afterEach(() => {
  Object.defineProperty(window, "location", { value: original, configurable: true });
  replace.mockClear();
});

describe("LocaleRedirect across four locales", () => {
  it("sends a Japanese browser to /ja/ and keeps the query and hash", () => {
    setLanguages(["ja-JP", "en"]);
    render(<LocaleRedirect />);
    expect(replace).toHaveBeenCalledWith("/ja/?p=1#x");
  });

  it("sends a Simplified Chinese browser to /zh/", () => {
    setLanguages(["zh-CN"]);
    render(<LocaleRedirect />);
    expect(replace).toHaveBeenCalledWith("/zh/?p=1#x");
  });

  it("sends a Traditional Chinese browser to /en/", () => {
    setLanguages(["zh-TW", "en-US"]);
    render(<LocaleRedirect />);
    expect(replace).toHaveBeenCalledWith("/en/?p=1#x");
  });

  it("lets a stored choice win", () => {
    window.localStorage.setItem("ontology-atlas:locale", "ko");
    setLanguages(["ja-JP"]);
    render(<LocaleRedirect />);
    expect(replace).toHaveBeenCalledWith("/ko/?p=1#x");
  });

  it("offers one raw anchor per locale", () => {
    setLanguages(["en"]);
    render(<LocaleRedirect />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/en/", "/ko/", "/ja/", "/zh/"]);
  });
});
