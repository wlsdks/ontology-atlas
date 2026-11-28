import { createHash } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IntlProvider, useTranslations } from "use-intl";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import { clipLines, POPOVER_LINE_CHARS, WikiCitationPopover, type ReaderCitation, type WikiCitationPopoverHandle } from "./WikiCitationPopover";

const TEXT = "First line.\nThe cited line.\nThird line.\n";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** A granted handle whose read finishes when the test says so, counting each read. */
function handle(text = TEXT) {
  let finish: () => void = () => {};
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const getFile = vi.fn(async () => {
    await gate;
    return { arrayBuffer: async () => new TextEncoder().encode(text).buffer } as unknown as File;
  });
  return { handle: { getFile } as unknown as FileSystemFileHandle, getFile, finish: () => finish() };
}

function Harness({ popover, handles, recorded = null, bytes = 100, onReveal = () => {} }: {
  popover: React.RefObject<WikiCitationPopoverHandle | null>;
  handles: ReadonlyMap<string, FileSystemFileHandle>;
  recorded?: string | null;
  bytes?: number;
  onReveal?: (path: string) => void;
}) {
  const t = useTranslations("library");
  return (
    <>
      <button type="button" data-testid="cite">cite</button>
      <WikiCitationPopover ref={popover} sourceHandles={handles} recordedHash={() => recorded}
        listedBytes={new Map([["sources/a.txt", bytes]])} canReveal onOpenSource={() => {}} onReveal={onReveal} t={t} />
    </>
  );
}

function setup(options: { recorded?: string | null; bytes?: number; citation?: ReaderCitation; text?: string } = {}) {
  const file = handle(options.text);
  const popover = createRef<WikiCitationPopoverHandle>();
  const handles = new Map([["sources/a.txt", file.handle]]);
  render(
    <IntlProvider locale="en" messages={en}>
      <Harness popover={popover} handles={handles} recorded={options.recorded ?? null} bytes={options.bytes} />
    </IntlProvider>,
  );
  const button = screen.getByTestId("cite") as HTMLButtonElement;
  const citation = options.citation ?? { path: "sources/a.txt", rawPath: "sources/a.txt", anchor: "l2" };
  const press = () => act(() => popover.current!.open(citation, button));
  return { ...file, press, button };
}

afterEach(() => {
  cleanup();
});

describe("the citation popover", () => {
  it("says a source changed only when the page recorded a hash that the bytes no longer match", async () => {
    for (const [recorded, changed] of [[null, false], [sha(TEXT), false], ["b".repeat(64), true]] as const) {
      const { press, finish } = setup({ recorded });
      press();
      finish();
      const shown = await screen.findByTestId("wiki-citation-popover");
      await waitFor(() => expect(shown).toHaveAttribute("data-state", changed ? "changed" : "resolved"));
      expect(screen.queryByTestId("wiki-citation-changed") !== null).toBe(changed);
      cleanup();
    }
  });

  it("does not read a source listed above 5 MB, and offers the source instead", async () => {
    const { press, getFile } = setup({ bytes: 5_000_001 });
    press();
    expect(await screen.findByTestId("wiki-citation-too-large")).toHaveTextContent("This file is too large to show here.");
    expect(screen.getByTestId("wiki-citation-open-source")).toBeInTheDocument();
    expect(getFile).not.toHaveBeenCalled();
  });

  it("reads nothing for a citation the folder does not hold, and offers no press on it", async () => {
    const { press, getFile } = setup({ citation: { path: null, rawPath: "sources/a.txt", anchor: "l2" } });
    press();
    expect(await screen.findByTestId("wiki-citation-missing")).toHaveTextContent("This file is not in the folder.");
    expect(getFile).not.toHaveBeenCalled();
    expect(screen.queryByTestId("wiki-citation-reveal")).toBeNull();
    expect(screen.queryByTestId("wiki-citation-open-source")).toBeNull();
  });

  it("while a read is in flight, leaves Escape to the reader and starts no second read on a second press", async () => {
    const { press, getFile, finish, button } = setup();
    press();
    press();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const reader = vi.fn();
    window.addEventListener("keydown", reader);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(escape); });
    window.removeEventListener("keydown", reader);
    expect(escape.defaultPrevented).toBe(false);
    expect(reader).toHaveBeenCalledTimes(1);
    // Closed before its read finished: no entry and no passage text are left behind.
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByTestId("wiki-citation-popover")).toBeNull();
    expect(document.body.textContent).not.toContain("The cited line.");
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closed by a press elsewhere before its read finished, leaves nothing behind", async () => {
    const { press, finish } = setup();
    press();
    fireEvent.mouseDown(document.body);
    await act(async () => { finish(); await Promise.resolve(); });
    expect(screen.queryByTestId("wiki-citation-popover")).toBeNull();
    expect(document.body.textContent).not.toContain("The cited line.");
  });

  it("once shown, takes Escape for itself", async () => {
    const { press, finish } = setup();
    press();
    finish();
    await screen.findByTestId("wiki-citation-cited");
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(escape); });
    expect(escape.defaultPrevented).toBe(true);
  });
});

describe("clipping the cited lines", () => {
  it("bounds a megabyte line at 400 characters, then an ellipsis", () => {
    const line = "x".repeat(1_000_000);
    const { text } = clipLines([{ anchor: "l1", text: `${line}\nshort` }] as never, 12);
    const [first, second] = text.split("\n");
    expect(first).toHaveLength(POPOVER_LINE_CHARS + 1);
    expect(first!.endsWith("…")).toBe(true);
    expect(second).toBe("short");
  });

  it("never cuts a surrogate pair in half", () => {
    const line = `${"x".repeat(POPOVER_LINE_CHARS - 1)}😀tail`;
    const { text } = clipLines([{ anchor: "l1", text: line }] as never, 12);
    expect(text).toBe(`${"x".repeat(POPOVER_LINE_CHARS - 1)}…`);
  });
});
