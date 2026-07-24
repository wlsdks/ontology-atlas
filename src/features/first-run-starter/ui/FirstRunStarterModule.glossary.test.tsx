import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../model/first-run-starter-dismiss";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * design-council B6 rank17 회귀 가드 — 도메인/역량/요소 3-용어 정의가
 * "?" 단축키 모달(ShortcutSheet) 안에만 있어 완전 초심자가 지도를 처음
 * 열자마자는 볼 수 없었다. INDEX 첫실행 카드(FirstRunStarterModule)로
 * 승격했으니 (1) 항상(접힘 없이) 보이는지, (2) ShortcutSheet 와 같은
 * i18n 키를 참조해 실제 한국어/영어 문구가 정확히 일치하는지를 고정한다.
 *
 * 다른 FirstRunStarterModule.test.tsx 는 'next-intl' 전체를 identity
 * mock 으로 대체해 실제 번역 내용을 검증하지 않는다 — 이 파일만 진짜
 * NextIntlClientProvider 를 써서 실제 문구 drift 를 잡는다.
 */

interface MockVault {
  status: string;
  manifest: { docs: unknown[] } | null;
  errorMessage: string | null;
  restoreAttempted: boolean;
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
    // <details> 등 접힘 컨테이너가 아니라 바로 렌더된 <dl> 이어야 한다.
    expect(glossary.tagName).toBe("DL");

    const body = within(glossary);
    expect(body.getByText(koMessages.searchWidgets.shortcuts.glossary.title)).toBeInTheDocument();
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
