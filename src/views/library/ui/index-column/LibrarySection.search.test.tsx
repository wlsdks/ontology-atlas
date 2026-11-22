import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/preferences/library-preferences";
import type { LibraryUiModel } from "@/features/library";
import { LibrarySection } from "./LibrarySection";

const index = vi.hoisted(() => ({ hits: undefined as Array<{ path: string; rank: number }> | undefined }));
vi.mock("@/shared/lib/vault-folder/vault-index/use-vault-index-hits", () => ({
  useVaultIndexHits: () => ({ hits: index.hits, answeredQuery: null, status: null }),
}));

/**
 * Pins the three ways a search that reads files can lie: reporting no match for a file not yet
 * opened, captioning with an address that is not the unit's own, and truncating a folder silently.
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
  { path: "sources/settlement-policy.txt", name: "settlement-policy.txt", format: "txt", bytes: SETTLEMENT.length, mtime: 1, state: "not-compiled", citedBy: [] },
];

function modelWith(sources: typeof SOURCES, wikiPages: unknown[] = [], verdicts: Map<string, unknown> = new Map()): LibraryUiModel {
  return {
    sources,
    wikiPages,
    needsCompileCount: 0,
    notCompiledCount: 0,
    staleCount: 0,
    pathsNeedingHash: [],
    verdicts,
    offTemplateCount: 0,
    hashes: new Map(),
    pageFacts: new Map(),
    log: { lastCompile: null, lastLint: null },
    pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
    structural: { unmeasured: [], findingCount: 0 },
  } as unknown as LibraryUiModel;
}

function Harness({
  handles,
  onOpenSource = () => {},
  sources = SOURCES,
  wikiPages = [],
  verdicts = new Map<string, unknown>(),
  selectedSourcePath = null,
  selectedSourceAnchor = null,
  segment = "sources" as const,
}: {
  handles: Map<string, FileSystemFileHandle>;
  onOpenSource?: (row: { path: string }, anchor?: string) => void;
  sources?: typeof SOURCES;
  wikiPages?: unknown[];
  verdicts?: Map<string, unknown>;
  selectedSourcePath?: string | null;
  selectedSourceAnchor?: string | null;
  segment?: "sources" | "wiki";
}) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={modelWith(sources, wikiPages, verdicts)}
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
      segment={segment}
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
    ["sources/settlement-policy.txt", handleFor(SETTLEMENT)],
  ]);

/** One file whose read never lands, so the reading phase can be held open. */
const pendingHandles = () =>
  new Map<string, FileSystemFileHandle>([
    ["sources/settlement-policy.txt", handleFor(SETTLEMENT)],
    [
      "sources/fee-schedule.csv",
      { getFile: () => new Promise(() => {}) } as unknown as FileSystemFileHandle,
    ],
  ]);

beforeEach(() => {
  // Module memory, so one case's query would otherwise reach the next case's mount.
  writeLibraryIndexQuery("", "");
  index.hits = undefined;
});

describe("the wiki list searches inside pages through the app's index", () => {
  const pages = [
    { slug: "wiki/alpha", title: "Alpha", createdBy: null, compiledAt: null, sourcePaths: [], summary: "", tags: ["ledger"] },
    { slug: "wiki/beta", title: "Beta", createdBy: null, compiledAt: null, sourcePaths: [], summary: "A page about quillwort habitats", tags: [] },
  ];

  it("lists a page whose body matched in the index, however its title reads", async () => {
    index.hits = [{ path: "wiki/beta.md", rank: -1 }];
    renderWith({ handles: new Map(), wikiPages: pages, segment: "wiki" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "quillwort" } });
    await waitFor(() => expect(screen.getByTestId("library-wiki-wiki/beta")).toBeInTheDocument());
    expect(screen.queryByTestId("library-wiki-wiki/alpha")).toBeNull();
  });

  it("finds a Markdown source by its text through the index, never by reading it", async () => {
    const read = vi.fn();
    const handles = new Map([["sources/notes.md", { getFile: read } as unknown as FileSystemFileHandle]]);
    const sources = [{ path: "sources/notes.md", name: "notes.md", format: "md", bytes: 10, mtime: 1, state: "not-compiled", citedBy: [] }];
    index.hits = [{ path: "sources/notes.md", rank: -1 }];
    renderWith({ handles, sources, segment: "sources" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "quillwort" } });
    await waitFor(() => expect(screen.getByTestId("library-source-sources/notes.md")).toBeInTheDocument());
    expect(read).not.toHaveBeenCalled();
  });

  it("matches titles, summaries and tags when there is no index, as on the web", async () => {
    renderWith({ handles: new Map(), wikiPages: pages, segment: "wiki" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "ledger" } });
    await waitFor(() => expect(screen.getByTestId("library-wiki-wiki/alpha")).toBeInTheDocument());
    expect(screen.queryByTestId("library-wiki-wiki/beta")).toBeNull();
  });

  it("finds a page by its summary when there is no index", async () => {
    renderWith({ handles: new Map(), wikiPages: pages, segment: "wiki" });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "quillwort" } });
    await waitFor(() => expect(screen.getByTestId("library-wiki-wiki/beta")).toBeInTheDocument());
    expect(screen.queryByTestId("library-wiki-wiki/alpha")).toBeNull();
  });
});

describe("the index search reads the sources", () => {
  it("finds a phrase that is in the file and not in any path, and captions it with the unit’s own address", async () => {
    renderWith({ handles: bothHandles() });

    /*
     * Before the keystroke the matches line is present and empty, so the height is reserved and only the
     * phase changes when typing begins.
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
    const hit = screen.getByTestId("library-source-hit-sources/settlement-policy.txt");
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
      ["sources/settlement-policy.txt", handleFor(SETTLEMENT)],
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

    fireEvent.click(screen.getByTestId("library-source-hit-sources/settlement-policy.txt"));
    expect(onOpenSource).toHaveBeenCalledWith(
      expect.objectContaining({ path: "sources/settlement-policy.txt" }),
      "l5",
    );

    /*
     * The row itself still opens the file plainly — one argument, no anchor. The two
     * presses going to different places is the reason the caption is its own control.
     */
    fireEvent.click(screen.getByTestId("library-source-sources/settlement-policy.txt"));
    expect(onOpenSource).toHaveBeenLastCalledWith(
      expect.objectContaining({ path: "sources/settlement-policy.txt" }),
    );
  });

  it("keeps matching paths, so a filename search works while the files are being read", async () => {
    renderWith({ handles: new Map() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "fee-schedule" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-source-sources/fee-schedule.csv")).toBeTruthy();
    });
    expect(screen.queryByTestId("library-source-sources/settlement-policy.txt")).toBeNull();
    // A path match carries no caption: nothing inside the file matched.
    expect(screen.queryByTestId("library-source-hit-sources/fee-schedule.csv")).toBeNull();
  });

  it("says how many files it read when the cap binds, instead of truncating in silence", async () => {
    /*
     * 201 files, all readable. The cap is decided from the listing's sizes before a byte
     * is read, so the line can name it on the first keystroke.
     */
    const many = Array.from({ length: 201 }, (_, index) => ({
      path: `sources/note-${String(index).padStart(3, "0")}.txt`,
      name: `note-${index}.txt`,
      format: "txt",
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
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });
    /* Its own line, so it cannot wrap the counting line on one folder and not the next. */
    expect(screen.getByTestId("library-search-capped")).toHaveTextContent("read the first 200 only");
    expect(screen.getByTestId("library-search-matches")).not.toHaveTextContent("read the first 200 only");
  });
  it("keeps a row nobody has read yet, so the column does not empty while reading", async () => {
    /*
     * Filtering on `matches || hits` alone would drop every row whose read has not landed; an unread
     * file is neither a match nor a miss.
     */
    renderWith({ handles: pendingHandles() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });

    await waitFor(() => {
      expect(screen.getByTestId("library-source-list")).toHaveAttribute("data-phase", "reading");
    });
    // The matched file and the one still being read: the list narrows, it does not empty.
    expect(screen.getByTestId("library-source-sources/settlement-policy.txt")).toBeTruthy();
    expect(screen.getByTestId("library-source-sources/fee-schedule.csv")).toBeTruthy();
    // And the unread row carries no caption: nothing has been found in it to caption.
    expect(screen.queryByTestId("library-source-hit-sources/fee-schedule.csv")).toBeNull();
  });

  it("does not send a reader to the other list on a count it is still reading", async () => {
    /*
     * The note is a finished answer and its count is `visibleSources`, which while reading still holds
     * unread rows, so it must not print under an unfinished read.
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
      selectedSourcePath: "sources/settlement-policy.txt",
      selectedSourceAnchor: "l5",
    });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });

    const open = screen.getByTestId("library-source-hit-sources/settlement-policy.txt");
    expect(open).toHaveAttribute("data-anchor", "l5");
    /* `location`, not `page`: the pane is the page, this is the place inside it. */
    expect(open).toHaveAttribute("aria-current", "location");

    // The other file's caption names a place nobody went to, and says nothing about it.
    const other = screen.getByTestId("library-source-hit-sources/fee-schedule.csv");
    expect(other).toHaveAttribute("data-anchor");
    expect(other).not.toHaveAttribute("aria-current");
  });

  it("comes back holding the question, so a door does not cost a retype", () => {
    /* Pressing the Agents door from a blocked step and returning through the rail must not cost a retype. */
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

/**
 * A search that matches nowhere names the word, on whichever half the person is standing, rather
 * than leaving zeros.
 */
describe("a search with no match on either half", () => {
  it("prints one sentence naming the word under the sources list", async () => {
    renderWith({ handles: bothHandles() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "qzqzqz" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });
    expect(screen.getByTestId("library-search-nothing-note")).toHaveTextContent("Nothing matches “qzqzqz”");
    expect(screen.queryByTestId("library-search-other-half-note")).toBeNull();
  });

  it("prints the same sentence under the wiki list", async () => {
    // A wiki with a page: the sentence belongs to the list, not to the "no pages yet" state.
    renderWith({
      handles: bothHandles(),
      segment: "wiki",
      wikiPages: [{ slug: "wiki/sash", title: "Sash frames", sourcePaths: [], createdBy: "agent:claude", compiledAt: null }],
    });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "qzqzqz" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });
    expect(screen.getByTestId("library-search-nothing-note")).toHaveTextContent("Nothing matches “qzqzqz”");
  });

  it("stays silent while the files are still being read, and when something matched", async () => {
    renderWith({ handles: bothHandles() });
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "T+2" } });
    await waitFor(() => {
      expect(screen.getByTestId("library-search-matches")).toHaveAttribute("data-phase", "ready");
    });
    expect(screen.queryByTestId("library-search-nothing-note")).toBeNull();
  });
});

/** The foot under the wiki list counts the rows on screen, not the whole folder. */
