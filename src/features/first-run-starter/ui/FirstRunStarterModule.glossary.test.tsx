import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../model/first-run-starter-dismiss";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * Regression guard — the three-term definitions (domain / capability / element) used
 * to live only inside the "?" shortcut modal (ShortcutSheet), where a complete
 * beginner could not see them the moment they first opened the map. They were
 * promoted to the INDEX first-run card (FirstRunStarterModule), so this pins that
 * (1) they are always visible with no fold, and (2) they reference the same i18n keys
 * as ShortcutSheet so the real Korean and English strings match exactly.
 *
 * The other FirstRunStarterModule.test.tsx replaces all of 'next-intl' with an
 * identity mock and does not verify real translations — this file alone uses a real
 * NextIntlClientProvider to catch actual copy drift.
 */

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
  /** "Has a vault ever been connected?" — the input deciding who the sample notice targets (2026-08-02). */
  recentVaults: unknown[];
  open: ReturnType<typeof vi.fn>;
  scaffoldOntology: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  vault: null as unknown as MockVault,
  mode: "static" as "static" | "local",
}));

vi.mock("@/features/docs-vault-local", async () => {
  const actual = await vi.importActual<typeof import("@/features/docs-vault-local")>(
    "@/features/docs-vault-local",
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock("@/features/data-source-mode", () => ({
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

describe("FirstRunStarterModule 3-용어 glossary 승격 (rank17)", () => {
  beforeEach(() => {
    mocks.vault = makeVault();
    mocks.mode = "static";
    window.sessionStorage.removeItem(FIRST_RUN_STARTER_DISMISSED_KEY);
    window.localStorage.removeItem("demo:sample-source:v1");
  });

  it("접힘 없이(disclosure 뒤 아님) 항상 도메인/역량/요소 정의가 보인다 (ko)", () => {
    renderWithLocale("ko");

    const glossary = screen.getByTestId("first-run-starter-glossary");
    // It must be a directly rendered <dl>, not inside a folding container such as <details>.
    expect(glossary.tagName).toBe("DL");

    // The title is a label (<p>) above the <dl>, so it is searched for outside the dl.
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

  it("영문 로케일에서도 같은 키로 렌더된다 (en)", () => {
    renderWithLocale("en");

    const glossary = within(screen.getByTestId("first-run-starter-glossary"));
    expect(glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.domainTerm)).toBeInTheDocument();
    expect(
      glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.capabilityTerm),
    ).toBeInTheDocument();
    expect(glossary.getByText(enMessages.searchWidgets.shortcuts.glossary.elementTerm)).toBeInTheDocument();
  });

  it("지도 계층 순서(도메인 → 역량 → 요소)로 렌더된다", () => {
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
