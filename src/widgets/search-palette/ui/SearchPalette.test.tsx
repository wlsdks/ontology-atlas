import { useState, type ReactNode } from "react";
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
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
  // Unimplemented in jsdom — used to scroll the active row.
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
 * rank2/18 (design council batch B1) — the overlay a11y backbone. SearchPalette
 * already implemented ESC, the Tab trap and trigger focus return itself (with 0 test
 * coverage); this pins that the rank2 spring unification did not break that contract.
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

    // rank2 — the exit unmounts only after the opacity/translateY spring has played
    // through (AnimatePresence). The "only the closing properties change and it
    // vanishes instantly" regression is caught here too.
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

    // AnimatePresence removes the dialog before React finishes every effect
    // cleanup. Under a loaded full-suite worker, the mutation observer can
    // therefore resolve one tick before the cleanup restores focus.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
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
