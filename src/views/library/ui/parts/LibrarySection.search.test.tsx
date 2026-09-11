import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LibraryUiModel } from "../../lib/use-library-model";
import { LibrarySection } from "./LibrarySection";

/**
 * **The index column answers from inside the documents — slice U2's first decision.**
 *
 * Measured 2026-09-11 on a six-file folder with no agent: typing "T+2" matched nothing,
 * because the source half filtered on `row.path` alone. What these cases pin is not that
 * a match appears — it is the three ways a search that reads files can lie:
 *
 * 1. it reports "no match" for a file it has not opened yet (the reading state exists so
 *    that *not read* and *not there* are different sentences on screen);
 * 2. it shows a caption whose address is not the unit's own (a person presses it and
 *    lands somewhere the phrase is not);
 * 3. it truncates a folder silently, so a partial search reads as a complete one.
 */

const SETTLEMENT = [
  "# Settlement Policy",
  "",
  "## Settlement cycle",
  "",
  "Card payments settle on T+2 business days. Bank transfers settle same day when",
  "the transfer clears before 15:00 KST, and on the next business day otherwise.",
].join("\n");

const FEES = "method,region,note\ncard_domestic,KR,T+2\nbank_transfer,KR,same day\n";

/** A handle that behaves like the folder walk's, for the two calls the reader makes. */
function handleFor(text: string): FileSystemFileHandle {
  const bytes = new TextEncoder().encode(text);
  return {
    getFile: async () => ({
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    }),
  } as unknown as FileSystemFileHandle;
}

const SOURCES = [
  { path: "sources/fee-schedule.csv", name: "fee-schedule.csv", format: "csv", bytes: FEES.length, mtime: 1, state: "not-compiled", citedBy: [] },
  { path: "sources/settlement-policy.md", name: "settlement-policy.md", format: "md", bytes: SETTLEMENT.length, mtime: 1, state: "not-compiled", citedBy: [] },
];

function modelWith(sources: typeof SOURCES): LibraryUiModel {
  return {
    sources,
    wikiPages: [],
    needsCompileCount: 0,
    notCompiledCount: 0,
    staleCount: 0,
    pathsNeedingHash: [],
    verdicts: new Map(),
    offTemplateCount: 0,
    hashes: new Map(),
    pageTexts: new Map(),
    log: { lastCompile: null, lastLint: null },
    pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
  } as unknown as LibraryUiModel;
}

function Harness({
  handles,
  onOpenSource = () => {},
  sources = SOURCES,
}: {
  handles: Map<string, FileSystemFileHandle>;
  onOpenSource?: (row: { path: string }, anchor?: string) => void;
  sources?: typeof SOURCES;
}) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={modelWith(sources)}
      selectedSlug={null}
      selectedSourcePath={null}
      onSelect={() => {}}
      onOpenSource={onOpenSource}
      sourceHandles={handles}
      vaultScope="folder-a"
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onCompile={() => {}}
      onLint={() => {}}
      segment="sources"
      compileNote={null}
      busy={false}
      t={t}
    />
  );
}

function renderWith(props: Parameters<typeof Harness>[0]) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <Harness {...props} />
    </NextIntlClientProvider>,
  );
}

const bothHandles = () =>
  new Map<string, FileSystemFileHandle>([
    ["sources/fee-schedule.csv", handleFor(FEES)],
    ["sources/settlement-policy.md", handleFor(SETTLEMENT)],
  ]);

describe("the index search reads the sources", () => {
  it("finds a phrase that is in the file and not in any path, and captions it with the unit’s own address", async () => {
    renderWith({ handles: bothHandles() });

    // Before the keystroke nothing has been read and both rows stand.
    expect(screen.queryByTestId("library-search-matches")).toBeNull();

    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });

    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });

    /*
     * The recovery proof's own file, with the line the fixture really says it on — 11 in
     * the full fixture, 5 here, and in both cases the reader's number rather than the
     * wiki page's stale `#l14`.
     */
    const hit = screen.getByTestId("library-source-hit-sources/settlement-policy.md");
    expect(hit).toHaveTextContent("line 5");
    // Verbatim, and therefore past the sentence: a hard-wrapped line ends mid-thought.
    expect(hit).toHaveTextContent("Card payments settle on T+2 business days. Bank transfers settle same day when");

    // Two files hold it, four units in total — the passage count is not the file count.
    expect(screen.getByTestId("library-search-matches")).toHaveTextContent("2 sources (2 passages)");
  });

  it("says it is still reading rather than reporting a count it cannot stand behind", async () => {
    /*
     * One file's read never settles. The matches line must not say "1 source matched"
     * while a second file is still in flight — *not read yet* and *not there* are
     * different facts, and only one of them is a search result.
     */
    const handles = new Map<string, FileSystemFileHandle>([
      ["sources/settlement-policy.md", handleFor(SETTLEMENT)],
      [
        "sources/fee-schedule.csv",
        { getFile: () => new Promise(() => {}) } as unknown as FileSystemFileHandle,
      ],
    ]);
    renderWith({ handles });

    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });

    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "reading");
    });
    const line = screen.getByTestId("library-search-matches");
    expect(line).toHaveTextContent("Reading the sources");
    expect(line).not.toHaveTextContent("matched");
  });

  it("sends the caption’s press to the file at that unit, not to the top of the pane", async () => {
    const onOpenSource = vi.fn();
    renderWith({ handles: bothHandles(), onOpenSource });

    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });

    fireEvent.click(screen.getByTestId("library-source-hit-sources/settlement-policy.md"));
    expect(onOpenSource).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sources/settlement-policy.md" }),
      "l5",
    );

    /*
     * The row itself still opens the file plainly — one argument, no anchor. The two
     * presses going to different places is the reason the caption is its own control.
     */
    fireEvent.click(screen.getByTestId("library-source-sources/settlement-policy.md"));
    expect(onOpenSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "sources/settlement-policy.md" }),
    );
  });

  it("keeps matching paths, so a filename search works while the files are being read", async () => {
    renderWith({ handles: new Map() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "fee-schedule" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-source-sources/fee-schedule.csv")).toBeTruthy();
    });
    expect(screen.queryByTestId("library-source-sources/settlement-policy.md")).toBeNull();
    // A path match carries no caption: nothing inside the file matched.
    expect(screen.queryByTestId("library-source-hit-sources/fee-schedule.csv")).toBeNull();
  });

  it("says how many files it read when the cap binds, instead of truncating in silence", async () => {
    /*
     * 201 files, all readable. The cap is decided from the listing's sizes before a byte
     * is read, so the line can name it on the first keystroke.
     */
    const many = Array.from({ length: 201 }, (_, index) => ({
      path: `sources/note-${String(index).padStart(3, "0")}.md`,
      name: `note-${index}.md`,
      format: "md",
      bytes: SETTLEMENT.length,
      mtime: 1,
      state: "not-compiled",
      citedBy: [],
    }));
    const handles = new Map<string, FileSystemFileHandle>(
      many.map((row) => [row.path, handleFor(SETTLEMENT)] as const),
    );
    renderWith({ handles, sources: many as unknown as typeof SOURCES });

    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(
      () => {
        expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
      },
      { timeout: 5000 },
    );
    expect(screen.getByTestId("library-search-matches")).toHaveTextContent("read the first 200 only");
  });
});
