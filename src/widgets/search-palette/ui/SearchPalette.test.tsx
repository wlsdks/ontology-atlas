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

/** SearchPalette implements Escape, the Tab trap and trigger focus return itself; pinned here. */
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
  it('renders as role=dialog when open', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open trigger" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it('closes on Escape and unmounts after the exit animation', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "open trigger" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    // The exit unmounts only after the spring plays through (AnimatePresence).
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
  });

  it('returns focus to the trigger when closed', async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(window, { key: "Escape" });

    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));

    // AnimatePresence removes the dialog before every effect cleanup finishes, so under load focus
    // returns one tick later.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('marks the scrim and panel with data-overlay-spring', () => {
    render(
      <SearchPalette open onClose={() => {}} projects={[]} onSelect={() => {}} />,
    );

    expect(
      document.querySelectorAll('[data-overlay-spring="true"]').length,
    ).toBeGreaterThanOrEqual(2);
  });
});
