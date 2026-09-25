import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useClaimShellKey, type ShellKey } from "@/shared/lib/shell-key-claims";

const mocks = vi.hoisted(() => ({ blocking: false, realGuard: false }));

vi.mock("@/shared/lib/use-destination-shortcuts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/use-destination-shortcuts")>();
  return {
    blockingSurfaceOpen: () => (mocks.realGuard ? actual.blockingSurfaceOpen() : mocks.blocking),
  };
});

vi.mock("@/widgets/shortcut-sheet", () => ({
  ShortcutSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div role="dialog" aria-modal="true" data-testid="shell-sheet">
        <button type="button" onClick={onClose}>close</button>
      </div>
    ) : null,
}));

vi.mock("@/widgets/global-search", () => ({
  MountedGlobalSearch: ({ open, bindHotkey }: { open: boolean; bindHotkey?: boolean }) => (
    <div data-testid="shell-search" data-open={String(open)} data-bind-hotkey={String(Boolean(bindHotkey))} />
  ),
}));

import { ShellKeyboardSurfaces } from "./ShellKeyboardSurfaces";

function press(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  });
}

/** A screen that answers these keys itself, like the map. */
function ClaimingScreen({ keys }: { keys: ShellKey[] }) {
  useClaimShellKey("search", keys.includes("search"));
  useClaimShellKey("shortcuts", keys.includes("shortcuts"));
  return null;
}

afterEach(() => {
  mocks.blocking = false;
  mocks.realGuard = false;
  document.querySelectorAll("[data-test-dialog]").forEach((el) => el.remove());
});

/** Another screen's dialog, drawn and laid out; `leaving` marks it the way its exit frames do. */
function otherDialog({ leaving }: { leaving: boolean }) {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("data-test-dialog", "");
  el.getClientRects = (() => [{}] as unknown as DOMRectList) as typeof el.getClientRects;
  // `useExitLockout` pins this on the first frame of a framer exit (the `Dialog` primitive).
  if (leaving) el.style.pointerEvents = "none";
  document.body.append(el);
}

/**
 * 2026-09-25, against a real folder: `?` and ⌘K did nothing on Library, Git, Automations, Agents
 * and the harness (0 of 5 each), though the shortcut sheet lists both under Navigation, the
 * section it shows on every screen. The shell answers them now wherever the rail stands.
 */
describe("ShellKeyboardSurfaces", () => {
  it("opens the shortcut sheet on ? and closes it on ? again", async () => {
    render(<ShellKeyboardSurfaces disabled={false} />);
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(await screen.findByTestId("shell-sheet")).toBeInTheDocument();
    // The sheet is modal, and its own `?` still closes it, as its footer says.
    mocks.blocking = true;
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
  });

  it("does not stack the sheet over another open dialog", () => {
    mocks.blocking = true;
    render(<ShellKeyboardSurfaces disabled={false} />);
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
  });

  /*
   * 2026-09-26, real folder: `?` right after Esc closed the Automations sheet opened nothing,
   * because the guard still counted that sheet during its exit motion.
   */
  it("opens the sheet at once while another dialog is only leaving", async () => {
    mocks.realGuard = true;
    otherDialog({ leaving: true });
    render(<ShellKeyboardSurfaces disabled={false} />);
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(await screen.findByTestId("shell-sheet")).toBeInTheDocument();
  });

  it("still keeps the sheet off a dialog that is really open", () => {
    mocks.realGuard = true;
    otherDialog({ leaving: false });
    render(<ShellKeyboardSurfaces disabled={false} />);
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
  });

  it("opens the search on ⌘K and on ⇧⌘K, mounting it only then, and binding its own key", async () => {
    render(<ShellKeyboardSurfaces disabled={false} />);
    // Nothing that derives the ontology is mounted before anyone searches.
    expect(screen.queryByTestId("shell-search")).toBeNull();
    press({ key: "K", code: "KeyK", metaKey: true, shiftKey: true });
    const search = await screen.findByTestId("shell-search");
    expect(search).toHaveAttribute("data-open", "true");
    expect(search).toHaveAttribute("data-bind-hotkey", "true");
  });

  it("closes the sheet as the search opens, so two modal surfaces never stand at once", async () => {
    render(<ShellKeyboardSurfaces disabled={false} />);
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(await screen.findByTestId("shell-sheet")).toBeInTheDocument();
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(await screen.findByTestId("shell-search")).toHaveAttribute("data-open", "true");
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
  });

  it("stands aside for a screen that answers the keys itself", () => {
    render(
      <>
        <ClaimingScreen keys={["search", "shortcuts"]} />
        <ShellKeyboardSurfaces disabled={false} />
      </>,
    );
    press({ key: "?", code: "Slash", shiftKey: true });
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
    expect(screen.queryByTestId("shell-search")).toBeNull();
  });

  it("stands aside for one key only when only that key is claimed", async () => {
    render(
      <>
        <ClaimingScreen keys={["search"]} />
        <ShellKeyboardSurfaces disabled={false} />
      </>,
    );
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(screen.queryByTestId("shell-search")).toBeNull();
    press({ key: "?", code: "Slash", shiftKey: true });
    expect(await screen.findByTestId("shell-sheet")).toBeInTheDocument();
  });

  it("answers nothing where the rail does not stand", () => {
    render(<ShellKeyboardSurfaces disabled />);
    press({ key: "?", code: "Slash", shiftKey: true });
    press({ key: "k", code: "KeyK", metaKey: true });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
    expect(screen.queryByTestId("shell-search")).toBeNull();
  });

  it("leaves ? alone while a field has the keyboard", () => {
    render(
      <>
        <input aria-label="field" />
        <ShellKeyboardSurfaces disabled={false} />
      </>,
    );
    const field = screen.getByLabelText("field");
    act(() => {
      fireEvent.keyDown(field, { key: "?", code: "Slash", shiftKey: true });
    });
    expect(screen.queryByTestId("shell-sheet")).toBeNull();
  });
});
