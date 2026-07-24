import { useState, type ReactNode } from "react";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { SearchPalette } from "./SearchPalette";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/features/taxonomy", () => ({
  useTaxonomy: () => ({
    categoryLabel: (id?: string) => id ?? "—",
    statusLabel: (id?: string) => id ?? "—",
    categories: [],
    statuses: [],
  }),
}));

beforeAll(() => {
  // jsdom 미구현 — active row 스크롤에 쓰임.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/**
 * rank2/18 (설계협의회 batch B1) — 오버레이 a11y 백본. SearchPalette 는
 * ESC/Tab-trap/트리거 포커스복귀를 이미 자체 구현하고 있었지만(테스트
 * 커버리지 0), rank2 스프링 통일이 이 계약을 깨지 않았는지 여기서 고정한다.
 */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        open trigger
      </button>
      <SearchPalette
        open={open}
        onClose={() => setOpen(false)}
        projects={[]}
        onSelect={() => {}}
      />
    </>
  );
}

describe("SearchPalette", () => {
  it("열리면 role=dialog 로 렌더된다", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open trigger" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ESC 를 누르면 닫힌다 (framer AnimatePresence 퇴장 애니메이션 종료 후 언마운트)", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open trigger" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    // rank2 — 퇴장은 opacity/translateY 스프링을 다 재생한 뒤에야
    // 언마운트된다(AnimatePresence). "닫힘 프로퍼티만 바뀌고 즉시 사라짐"
    // 회귀를 여기서 같이 잡는다.
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"), {
      timeout: 2000,
    });
  });

  it("닫히면 트리거로 포커스가 복귀한다", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });

    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"), {
      timeout: 2000,
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("data-overlay-spring 검증마커가 스크림·패널에 있다", () => {
    render(
      <SearchPalette open onClose={() => {}} projects={[]} onSelect={() => {}} />,
    );

    expect(
      document.querySelectorAll('[data-overlay-spring="true"]').length,
    ).toBeGreaterThanOrEqual(2);
  });
});
