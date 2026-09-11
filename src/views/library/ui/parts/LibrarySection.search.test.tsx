import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/appearance-preferences";
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

function modelWith(sources: typeof SOURCES, wikiPages: unknown[] = []): LibraryUiModel {
  return {
    sources,
    wikiPages,
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
  wikiPages = [],
  selectedSourcePath = null,
  selectedSourceAnchor = null,
  segment = "sources" as const,
}: {
  handles: Map<string, FileSystemFileHandle>;
  onOpenSource?: (row: { path: string }, anchor?: string) => void;
  sources?: typeof SOURCES;
  wikiPages?: unknown[];
  selectedSourcePath?: string | null;
  selectedSourceAnchor?: string | null;
  segment?: "sources" | "wiki";
}) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={modelWith(sources, wikiPages)}
      selectedSlug={null}
      selectedSourcePath={selectedSourcePath}
      selectedSourceAnchor={selectedSourceAnchor}
      onSelect={() => {}}
      onOpenSource={onOpenSource}
      sourceHandles={handles}
      vaultScope="folder-a"
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onCompile={() => {}}
      onLint={() => {}}
      segment={segment}
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

/** One file whose read never lands, so the reading phase can be held open. */
const pendingHandles = () =>
  new Map<string, FileSystemFileHandle>([
    ["sources/settlement-policy.md", handleFor(SETTLEMENT)],
    [
      "sources/fee-schedule.csv",
      { getFile: () => new Promise(() => {}) } as unknown as FileSystemFileHandle,
    ],
  ]);

beforeEach(() => {
  // Module memory, so one case's query would otherwise reach the next case's mount.
  writeLibraryIndexQuery("", "");
});

describe("the index search reads the sources", () => {
  it("finds a phrase that is in the file and not in any path, and captions it with the unit’s own address", async () => {
    renderWith({ handles: bothHandles() });

    /*
     * Before the keystroke the line is **there and empty**. It used to be absent, and
     * appearing on the first character pushed the list 18–19px down under the pointer
     * (design-interaction, council 2026-09-11) — so the height is reserved and the phase
     * is the only thing that changes.
     */
    const reserved = screen.getByTestId("library-search-matches");
    expect(reserved).toHaveAttribute("data-phase", "idle");
    expect(reserved).toHaveTextContent("");

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
    /*
     * The words wait out the flicker threshold; the phase does not. At first-day size the
     * whole read lands in 34 ms, so a sentence drawn immediately is two frames of
     * explanation nobody can read.
     */
    expect(line).toHaveAttribute("data-reading-shown", "false");
    expect(line).not.toHaveTextContent("Reading the sources");
    await waitFor(() => {
      expect(line).toHaveAttribute("data-reading-shown", "true");
    });
    expect(line).toHaveTextContent("Reading the sources");
    expect(line).not.toHaveTextContent("matched");
    /*
     * ⚠️ **The per-file counter is not announced.** Inside the live region it is one
     * utterance per file — 200 of them on a capped folder — so it rides in an
     * `aria-hidden` span while the region carries the sentence.
     */
    expect(line).toHaveAttribute("aria-live", "polite");
    const counter = line.querySelector("[aria-hidden]");
    /* `0/2` here: the reads run in path order and this fixture's first file is the one
       that never lands. The fact under test is where the number lives, not its value. */
    expect(counter?.textContent).toContain("0/2");
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
    /* Its own line, so it cannot wrap the counting line on one folder and not the next. */
    expect(screen.getByTestId("library-search-capped")).toHaveTextContent("read the first 200 only");
    expect(screen.getByTestId("library-search-matches")).not.toHaveTextContent("read the first 200 only");
  });
  it("keeps a row nobody has read yet, so the column does not empty while reading", async () => {
    /*
     * ⚠️ The defect this replaces: filtering on `matches || hits` alone dropped every row
     * whose read had not landed, so on the 200-file folder the list stood at **0 rows
     * while the line said 1/200** (design-lead, council 2026-09-11) — "nothing found"
     * printed before "still reading". An unread file is neither a match nor a miss.
     */
    renderWith({ handles: pendingHandles() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });

    await waitFor(() => {
      expect(screen.getByTestId("library-source-list")).toHaveAttribute("data-phase", "reading");
    });
    // The matched file and the one still being read: the list narrows, it does not empty.
    expect(screen.getByTestId("library-source-sources/settlement-policy.md")).toBeTruthy();
    expect(screen.getByTestId("library-source-sources/fee-schedule.csv")).toBeTruthy();
    // And the unread row carries no caption: nothing has been found in it to caption.
    expect(screen.queryByTestId("library-source-hit-sources/fee-schedule.csv")).toBeNull();
  });

  it("does not send a reader to the other list on a count it is still reading", async () => {
    /*
     * The note is a finished answer — *none here, they are all on the other list* — and its
     * count is `visibleSources`, which while reading still holds the rows nobody has read.
     * Printed under an unfinished read it names a number that is about to change
     * (design-interaction, council 2026-09-11).
     */
    /* `sourcePaths` because the wiki half draws its shelf before a query is typed, and
       the shelf reads each page's freshness from them. */
    const pages = [{ slug: "alpha", title: "Alpha", createdBy: "agent:claude", sourcePaths: [] }];
    const reading = renderWith({ handles: pendingHandles(), wikiPages: pages, segment: "wiki" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "reading");
    });
    expect(screen.queryByTestId("library-search-other-half-note")).toBeNull();
    reading.unmount();

    // Once every file has been read, the same note is an answer and prints.
    renderWith({ handles: bothHandles(), wikiPages: pages, segment: "wiki" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-other-half-note")).toHaveTextContent("Show 2 sources");
    });
  });

  it("says which passage it opens, and which one the reader is standing on", async () => {
    renderWith({
      handles: bothHandles(),
      selectedSourcePath: "sources/settlement-policy.md",
      selectedSourceAnchor: "l5",
    });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });

    const open = screen.getByTestId("library-source-hit-sources/settlement-policy.md");
    expect(open).toHaveAttribute("data-anchor", "l5");
    /* `location`, not `page`: the pane is the page, this is the place inside it. */
    expect(open).toHaveAttribute("aria-current", "location");

    // The other file's caption names a place nobody went to, and says nothing about it.
    const other = screen.getByTestId("library-source-hit-sources/fee-schedule.csv");
    expect(other).toHaveAttribute("data-anchor");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("comes back holding the question, so a door does not cost a retype", () => {
    /*
     * U2's own door: press 「Agents」 from a blocked step and return through the rail. The
     * field used to be empty, so the person paid for the trip they were invited to take
     * (design-interaction, council 2026-09-11).
     */
    writeLibraryIndexQuery("folder-a", "T+2");
    const held = renderWith({ handles: bothHandles() });
    expect(screen.getByTestId("library-search")).toHaveValue("T+2");
    held.unmount();

    // Another folder's question is its own: the scope is what separates them, and a
    // folder that closed can never match again.
    writeLibraryIndexQuery("folder-b", "T+2");
    renderWith({ handles: bothHandles() });
    expect(screen.getByTestId("library-search")).toHaveValue("");
    writeLibraryIndexQuery("", "");
  });
});
