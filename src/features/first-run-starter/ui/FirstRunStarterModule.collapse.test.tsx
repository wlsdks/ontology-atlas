import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * The first-run card **collapses once the map is being used** (owner, 2026-08-19:
 * *"좌측에 이게 계속 떠있어서 보기 안좋으니 개선이 필요함"* — it looks bad with
 * this stuck on the left the whole time; it needs improving).
 *
 * What this check protects is not "it collapses" but **"it collapses and can be
 * brought back"**. Collapsing with no way back is not an improvement, it is deleting
 * a feature. So both directions are measured — including that it stays expanded while
 * nothing has been selected.
 *
 * Why mocks rather than providers, and how, follows the idiom of its sibling file
 * (`FirstRunStarterModule.glossary.test.tsx`).
 */
const mocks = vi.hoisted(() => ({
  vault: {
    status: "idle",
    manifest: null,
    errorMessage: null,
    restoreAttempted: true,
    recentVaults: [] as unknown[],
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
  },
}));

vi.mock("@/features/docs-vault-local", async () => {
  const actual = await vi.importActual<typeof import("@/features/docs-vault-local")>(
    "@/features/docs-vault-local",
  );
  return { ...actual, useLocalVault: () => mocks.vault };
});

vi.mock("@/features/data-source-mode", () => ({
  useDataSourceMode: () => "static",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function mount(nodeSelected: boolean) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <FirstRunStarterModule concepts={125} relations={258} domains={9} nodeSelected={nodeSelected} />
    </NextIntlClientProvider>,
  );
}

const REOPEN = koMessages.firstRunStarter.reopenLabel;

describe("첫 실행 카드 — 지도를 쓰기 시작하면 접힌다", () => {
  it("아무 노드도 안 골랐으면 펼쳐져 있다", () => {
    mount(false);
    expect(screen.queryByText(REOPEN)).toBeNull();
  });

  it("노드를 고르면 접히고, 되돌아오는 줄이 남는다", () => {
    mount(true);
    expect(screen.getByText(REOPEN)).toBeInTheDocument();
  });
});
