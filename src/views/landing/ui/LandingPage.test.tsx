import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
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
});
