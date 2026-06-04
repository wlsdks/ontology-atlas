import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { LocaleSwitch } from "./LocaleSwitch";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/",
  useRouter: () => ({ replace: vi.fn() }),
}));

function renderSwitch() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LocaleSwitch />
    </NextIntlClientProvider>,
  );
}

describe("LocaleSwitch", () => {
  it("keeps locale buttons large enough for first-viewport touch", () => {
    renderSwitch();

    expect(screen.getByRole("button", { name: "EN English" }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("button", { name: "KO 한국어" }).className).toContain(
      "min-w-8",
    );
  });
});
