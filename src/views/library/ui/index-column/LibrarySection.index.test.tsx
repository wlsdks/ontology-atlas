import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/preferences/library-preferences";
import type { LibraryUiModel } from "@/features/library";
import { LibrarySection } from "./LibrarySection";

const MODEL = {
  sources: [],
  wikiPages: [
    { slug: "wiki/a", title: "A", sourcePaths: [], createdBy: "agent:claude", compiledAt: null },
    { slug: "wiki/b", title: "B", sourcePaths: [], createdBy: "agent:claude", compiledAt: null },
  ],
  needsCompileCount: 0,
  notCompiledCount: 0,
  staleCount: 0,
  pathsNeedingHash: [],
  verdicts: new Map(),
  offTemplateCount: 0,
  hashes: new Map(),
  pageFacts: new Map(),
  log: { lastCompile: null, lastLint: null },
  /* The index reads source doubt from the pairing and waits for the app checks in `structural`. */
  pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
  structural: { unmeasured: [], findingCount: 0 },
} as unknown as LibraryUiModel;

type ReportProp = { count: number; open: boolean; onOpen: () => void; running?: boolean; unseen?: boolean };

function Harness({ onNewPage = null, report = null, model = MODEL }: { onNewPage?: ((title: string) => void) | null; report?: ReportProp | null; model?: LibraryUiModel }) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={model}
      selectedSlug={null}
      selectedSourcePath={null}
      onSelect={() => {}}
      onOpenSource={() => {}}
      sourceHandles={new Map()}
      vaultScope="test"
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onNewPage={onNewPage}
      report={report}
      /* The views and the index are the wiki half of the column; the switch above it decides. */
      segment="wiki"
      busy={false}
      t={t}
    />
  );
}

function mount(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={enMessages}>{node}</NextIntlClientProvider>);
}

/*
 * The index's search field now remembers what was typed for as long as the tab lives, so a
 * door to `/agents` and back does not cost a retype (slice U2). That memory is this
 * module's, so inside one test file a case that types a query would otherwise hand it to
 * the next case's mount. Emptying the field is what the product calls to forget it.
 */
beforeEach(() => {
  writeLibraryIndexQuery("", "");
});

describe("the wiki half of the column is an index: a tool row, two views, the groups", () => {
  const rows = () => [...document.querySelectorAll("[data-index-frame][data-current] [data-index-row]")];

  it("replaces the groups with the matching pages while the filter holds a word, and restores them when cleared", async () => {
    mount(<Harness />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "b" } });
    await waitFor(() => expect(screen.getByTestId("wiki-index")).toHaveAttribute("data-state", "matches"));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId("library-wiki-wiki/b")).toBeInTheDocument();
    expect(screen.getByTestId("library-search-matches").textContent).toContain("1 page");
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "" } });
    await waitFor(() => expect(screen.getByTestId("wiki-index")).toHaveAttribute("data-state", "index"));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it("starts a page from a title on Enter and hands the title back", () => {
    const onNewPage = vi.fn();
    mount(<Harness onNewPage={onNewPage} />);
    fireEvent.click(screen.getByTestId("library-new-page"));
    const title = screen.getByTestId("library-new-page-title");
    fireEvent.change(title, { target: { value: "Meeting notes" } });
    fireEvent.keyDown(title, { key: "Enter" });
    expect(onNewPage).toHaveBeenCalledWith("Meeting notes");
  });

  it("keeps a failed title for retry and Escape cancels without writing, returning focus", async () => {
    const onNewPage = vi.fn().mockResolvedValue(false);
    mount(<Harness onNewPage={onNewPage} />);
    const trigger = screen.getByTestId("library-new-page");
    trigger.focus();
    fireEvent.click(trigger);
    const title = screen.getByTestId("library-new-page-title");
    await waitFor(() => expect(title).toHaveFocus());
    expect(screen.getByRole("dialog", { name: "New wiki page" })).toHaveTextContent(
      "Markdown · draft",
    );
    expect(screen.getByRole("dialog", { name: "New wiki page" })).toHaveTextContent(
      "## Open questions",
    );
    fireEvent.change(title, { target: { value: "Retry me" } });
    expect(screen.getByRole("dialog", { name: "New wiki page" })).toHaveTextContent(
      "wiki/retry-me.md",
    );
    fireEvent.click(screen.getByTestId("library-new-page-make"));
    await waitFor(() => expect(onNewPage).toHaveBeenCalledWith("Retry me"));
    expect(title).toHaveValue("Retry me");
    expect(screen.getByTestId("library-new-page-row")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("library-new-page-row")).not.toBeInTheDocument());
    expect(onNewPage).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it("holds the index and its views only: no agent doors, no findings, no log lines, New page beside the filter", () => {
    mount(<Harness onNewPage={vi.fn()} />);
    for (const id of ["library-lint", "library-compile", "library-finding", "library-candidate", "library-write-mode", "library-file-answer", "library-wiki-log", "library-agent-missing"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    expect(screen.getByTestId("library-new-page")).toHaveAccessibleName("New page");
    expect(screen.getByTestId("library-search-box").parentElement!.contains(screen.getByTestId("library-new-page"))).toBe(true);
  });

  it("offers Check results always, saying it never ran until it did, and opens it on press", () => {
    const onOpen = vi.fn();
    mount(<Harness report={{ count: 0, open: false, onOpen }} />);
    const row = screen.getByTestId("library-open-report");
    expect(row).toHaveTextContent("Check results");
    expect(row).toHaveTextContent("Not run yet");
    cleanup();
    mount(<Harness report={{ count: 6, open: false, onOpen }} />);
    expect(screen.getByTestId("library-open-report")).toHaveTextContent("6");
    fireEvent.click(screen.getByTestId("library-open-report"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("states when the log last changed, and Nothing yet before its first line", () => {
    mount(<Harness />);
    expect(screen.getByTestId("library-index-log")).toHaveTextContent("Nothing yet");
    cleanup();
    const logged = { ...MODEL, log: { lastCompile: { at: new Date().toISOString(), kind: "compile", summary: "", writer: "human" }, lastLint: null } } as unknown as LibraryUiModel;
    mount(<Harness model={logged} />);
    expect(screen.getByTestId("library-index-log")).toHaveTextContent("Just now");
  });

  /**
   * `running` and `unseen` are drawn from the prop and nowhere else; `LibraryPage`'s `choose` is where
   * seen lives. No e2e can reach `unseen: true` because the dock harness leaves `acp_start`
   * unanswered.
   */
  it("draws running, then unseen, and neither once the report has been read", () => {
    const onOpen = vi.fn();
    const draw = (report: ReportProp) => {
      mount(<Harness report={report} />);
      const row = screen.getByTestId("library-open-report");
      return {
        state: row.getAttribute("data-report-state"),
        running: screen.queryByTestId("library-report-running") !== null,
        unseen: screen.queryByTestId("library-report-unseen") !== null,
      };
    };

    expect(draw({ count: 6, open: false, onOpen })).toEqual({ state: null, running: false, unseen: false });
    cleanup();
    expect(draw({ count: 6, open: false, onOpen, running: true })).toEqual({ state: "running", running: true, unseen: false });
    cleanup();
    expect(draw({ count: 6, open: false, onOpen, unseen: true })).toEqual({ state: "unseen", running: false, unseen: true });
    cleanup();
    // A check in flight outranks a stale unseen mark: one row, one word.
    expect(draw({ count: 6, open: false, onOpen, running: true, unseen: true })).toEqual({ state: "running", running: true, unseen: false });
    cleanup();
    /* Reading it is what clears the mark: `LibraryPage` passes `unseen` as
       `reportUnseen && opened?.kind !== "report"`. */
    expect(draw({ count: 6, open: true, onOpen, unseen: false })).toEqual({ state: null, running: false, unseen: false });
  });
});

describe("a search whose matches sit on the other half of the switch", () => {
  function SourcesHarness({ model }: { model: LibraryUiModel }) {
    const t = useTranslations("library");
    return (
      <LibrarySection
        model={model}
        selectedSlug={null}
        selectedSourcePath={null}
        onSelect={() => {}}
        onOpenSource={() => {}}
      sourceHandles={new Map()}
      vaultScope="test"
        onAddFiles={() => {}}
        onFindDocuments={() => {}}
        onImportFromService={() => {}}
        onNewPage={null}
        report={null}
        segment="sources"
        busy={false}
        t={t}
      />
    );
  }

  it("names the matches on the other list and switches there, instead of an empty list under a count", () => {
    window.localStorage.removeItem("atlas.library.index-segment");
    const model = {
      ...MODEL,
      sources: [{ path: "sources/quotes.csv", name: "quotes.csv", format: "csv", size: 10, state: "compiled", citedBy: [] }],
      wikiPages: [{ slug: "wiki/sash", title: "Sash frames", sourcePaths: [], createdBy: "agent:claude", compiledAt: null }],
    } as unknown as LibraryUiModel;
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <SourcesHarness model={model} />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "sash" } });
    expect(screen.getByTestId("library-search-matches")).toHaveTextContent("0 sources");
    const door = screen.getByTestId("library-search-other-half");
    expect(door).toHaveTextContent("Show 1 wiki page");
    fireEvent.click(door);
    expect(window.localStorage.getItem("atlas.library.index-segment")).toBe("wiki");
  });
});
