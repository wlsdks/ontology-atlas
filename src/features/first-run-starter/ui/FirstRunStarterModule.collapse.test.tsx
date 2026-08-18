import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import { FirstRunStarterModule } from "./FirstRunStarterModule";

/**
 * 첫 실행 카드는 **지도를 쓰기 시작하면 접힌다** (2026-08-19 소유자:
 * *"좌측에 이게 계속 떠있어서 보기 안좋으니 개선이 필요함"*).
 *
 * 이 검사가 지키는 것은 「접힌다」가 아니라 **「접히고 되돌아올 수 있다」** 다.
 * 접기만 하고 돌아올 길이 없으면 그건 개선이 아니라 기능 삭제다. 그래서 두
 * 방향을 다 잰다 — 안 고른 상태에서 펼쳐져 있는 것까지.
 *
 * 프로바이더 대신 목을 쓰는 이유와 방식은 형제 파일
 * (`FirstRunStarterModule.glossary.test.tsx`)의 관용구를 그대로 따른다.
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
