import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { DOGFOOD_CENSUS } from "../model/dogfood-census.generated";
import { LandingPage } from "./LandingPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/locale-switch", () => ({
  LocaleSwitch: () => <div data-testid="locale-switch" />,
}));

vi.mock("@/features/macos-download-link", () => ({
  MacosDownloadLink: ({ children, className }: React.ComponentProps<"a">) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
}));

function renderLanding() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LandingPage />
    </NextIntlClientProvider>,
  );
}

describe("LandingPage", () => {
  it("keeps the hero headline readable across the visual line break", () => {
    renderLanding();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Codebase ontology that grows with AI",
    );
  });

  it("renders the hero miniature from the real dogfood census, not mock data", () => {
    const { container } = renderLanding();

    // 음각 숫자 = 실데이터 계약 — 생성된 census 값이 그대로 표기되어야 한다.
    const engraved = container.querySelectorAll('[data-token="engraved-numeral"]');
    expect(engraved.length).toBeGreaterThan(0);
    expect(engraved[0]).toHaveTextContent(String(DOGFOOD_CENSUS.concepts));
    expect(engraved[0]).toHaveTextContent(String(DOGFOOD_CENSUS.relations));

    // kind = shape 미니어처 — 실제 domain slug 라벨이 SVG 에 등장.
    const instrument = container.querySelector('[data-token="kind-glyph"]');
    expect(instrument).not.toBeNull();
    for (const domain of DOGFOOD_CENSUS.domains) {
      expect(instrument!.textContent).toContain(domain.slug);
    }
  });

  it("engraves the explainer card indices as numerals", () => {
    const { container } = renderLanding();

    const numerals = [...container.querySelectorAll('[data-token="engraved-numeral"]')].map(
      (el) => el.textContent,
    );
    expect(numerals).toEqual(
      expect.arrayContaining([expect.stringContaining("01"), expect.stringContaining("02")]),
    );
  });
});
