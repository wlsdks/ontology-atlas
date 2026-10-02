import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../model/first-run-starter-dismiss";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  recentVaults: unknown[];
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: "static" as "static" | "local",
}));

vi.mock("@/entities/vault-session/model/LocalVaultProvider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/LocalVaultProvider")>()),
  useLocalVault: () => mocks.vault,
}));
vi.mock("@/entities/vault-session/model/use-data-source-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/entities/vault-session/model/use-data-source-mode")>()),
  useDataSourceMode: () => mocks.mode,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function makeVault(): MockVault {
  return {
    status: "idle",
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [],
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  };
}

function renderWithLocale(locale: "ko" | "en") {
  const messages = locale === "ko" ? koMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <FirstRunStarterModule concepts={12} relations={20} domains={4} />
    </NextIntlClientProvider>,
  );
}

describe("FirstRunStarterModule three-term glossary", () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = "static";
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem("demo:sample-source:v1");
  });

  it.each(["ko", "en"] as const)(
    "names the three words on its closed toggle and opens the ShortcutSheet definitions (%s)",
    (locale) => {
      const messages = locale === "ko" ? koMessages : enMessages;
      const words = messages.searchWidgets.shortcuts.glossary;
      renderWithLocale(locale);

      const toggle = screen.getByTestId("first-run-starter-glossary-toggle");
      expect(toggle).toHaveTextContent(messages.firstRunStarter.glossaryToggle);
      for (const term of [words.domainTerm, words.capabilityTerm, words.elementTerm]) {
        expect(toggle.textContent?.toLowerCase()).toContain(term.toLowerCase().slice(0, -1));
      }
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByText(words.domainDefinition)).not.toBeInTheDocument();

      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      const glossary = screen.getByTestId("first-run-starter-glossary");
      expect(glossary.tagName).toBe("DL");
      const body = within(glossary);
      for (const term of ["domain", "capability", "element"] as const) {
        expect(body.getByText(words[`${term}Term`])).toBeInTheDocument();
        expect(body.getByText(words[`${term}Definition`])).toBeInTheDocument();
      }
    },
  );

  it("renders in map hierarchy order domain, capability, element", () => {
    renderWithLocale("ko");
    fireEvent.click(screen.getByTestId("first-run-starter-glossary-toggle"));

    const glossary = screen.getByTestId("first-run-starter-glossary");
    const terms = [
      koMessages.searchWidgets.shortcuts.glossary.domainTerm,
      koMessages.searchWidgets.shortcuts.glossary.capabilityTerm,
      koMessages.searchWidgets.shortcuts.glossary.elementTerm,
    ];
    const text = glossary.textContent ?? "";
    const positions = terms.map((term) => text.indexOf(term));
    expect(positions.every((pos) => pos >= 0)).toBe(true);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);
  });

  it.each(["ko", "en"] as const)("names the sample with the switch's own word (%s)", (locale) => {
    renderWithLocale(locale);
    const checked = screen.getAllByRole("radio").find((radio) => radio.getAttribute("aria-checked") === "true");
    expect(checked?.textContent).toBeTruthy();
    expect(screen.getByTestId("first-run-starter-sample-line")).toHaveTextContent(checked!.textContent!);
    const close = screen.getByTestId("first-run-starter-dismiss");
    expect(close.getAttribute("aria-label")).toContain(close.textContent);
  });

  it.each(["ko", "en"] as const)("keeps the product name on one line in the body sentence (%s)", (locale) => {
    renderWithLocale(locale);
    const body = screen.getByTestId("first-run-starter-context");
    const kept = [...body.querySelectorAll("span")].find((span) => span.textContent === "Claude Code");
    expect(kept?.className).toContain("whitespace-nowrap");
    expect(body.textContent).not.toContain("<keep>");
  });
});
