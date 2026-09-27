import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../model/first-run-starter-dismiss";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * The three-term definitions are always visible on the first-run card and use the same i18n keys
 * as ShortcutSheet. Uses a real NextIntlClientProvider, unlike FirstRunStarterModule.test.tsx,
 * to catch copy drift.
 */

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  /** Decides who the sample notice targets. */
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

  it("always shows domain, capability and element definitions outside a disclosure (ko)", () => {
    renderWithLocale("ko");

    const glossary = screen.getByTestId("first-run-starter-glossary");
    // A directly rendered <dl>, not inside a folding container such as <details>.
    expect(glossary.tagName).toBe("DL");

    // The title is a <p> above the <dl>.
    expect(
      screen.getByText(koMessages.searchWidgets.shortcuts.glossary.title),
    ).toBeInTheDocument();
    const body = within(glossary);
    expect(body.getByText(koMessages.searchWidgets.shortcuts.glossary.domainTerm)).toBeInTheDocument();
    expect(
      body.getByText(koMessages.searchWidgets.shortcuts.glossary.domainDefinition),
    ).toBeInTheDocument();
    expect(
      body.getByText(koMessages.searchWidgets.shortcuts.glossary.capabilityTerm),
    ).toBeInTheDocument();
    expect(
      body.getByText(koMessages.searchWidgets.shortcuts.glossary.capabilityDefinition),
    ).toBeInTheDocument();
    expect(body.getByText(koMessages.searchWidgets.shortcuts.glossary.elementTerm)).toBeInTheDocument();
    expect(
      body.getByText(koMessages.searchWidgets.shortcuts.glossary.elementDefinition),
    ).toBeInTheDocument();
  });

  it("renders the same keys in the English locale (en)", () => {
    renderWithLocale("en");

    const glossary = within(screen.getByTestId("first-run-starter-glossary"));
    expect(glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.domainTerm)).toBeInTheDocument();
    expect(
      glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.capabilityTerm),
    ).toBeInTheDocument();
    expect(glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.elementTerm)).toBeInTheDocument();
  });

  it("renders in map hierarchy order domain, capability, element", () => {
    renderWithLocale("ko");

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
});
