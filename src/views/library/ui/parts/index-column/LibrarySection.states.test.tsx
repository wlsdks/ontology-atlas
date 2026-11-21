import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../../messages/en.json";
import type { LibraryUiModel } from "@/features/library";
import { LibrarySection, type SourceGroupFilter } from "./LibrarySection";

/**
 * Each waiting source wears one dot in its state's ink and a source with a page wears nothing; the
 * column draws no state line of its own.
 */

const BASE = {
  sources: [],
  wikiPages: [],
  needsCompileCount: 0,
  notCompiledCount: 0,
  staleCount: 0,
  partialCount: 0,
  pathsNeedingHash: [],
  verdicts: new Map(),
  offTemplateCount: 0,
  hashes: new Map(),
  pageFacts: new Map(),
  log: { lastCompile: null, lastLint: null },
  pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
} as unknown as LibraryUiModel;

function source(index: number, state: string) {
  return { path: `sources/doc-${index}.md`, name: `doc-${index}.md`, format: "md", bytes: 20, mtime: 1, state, citedBy: state === "not-compiled" ? [] : ["wiki/page"] };
}

function Harness({ model, segment, compile = true, stateFilter = null, groupFilter = null }: { model: LibraryUiModel; segment: "sources" | "wiki"; compile?: boolean; stateFilter?: string | null; groupFilter?: SourceGroupFilter | null }) {
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
      onCompile={compile ? () => {} : null}
      onLint={() => {}}
      onNewPage={null}
      report={null}
      segment={segment}
      actionsNote={null}
      inApp={false}
      busy={false}
      stateFilter={stateFilter as never}
      groupFilter={groupFilter}
      t={t}
    />
  );
}

function mount(model: LibraryUiModel, segment: "sources" | "wiki", compile = true, stateFilter: string | null = null, groupFilter: SourceGroupFilter | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Harness model={model} segment={segment} compile={compile} stateFilter={stateFilter} groupFilter={groupFilter} />
    </NextIntlClientProvider>,
  );
}

const list = () => screen.getByTestId("library-source-list");

afterEach(cleanup);

describe("the source list marks what waits", () => {
  it("gives every waiting row one dot named by its state, and a row with a page none", () => {
    const sources = [...Array.from({ length: 13 }, (_, i) => source(i, "stale")), source(13, "not-compiled"), source(14, "compiled")];
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");

    // The column has no state line: the band's presses say each state once.
    expect(screen.queryByTestId("library-source-states")).toBeNull();
    const stale = screen.getAllByTestId("library-source-state-stale");
    expect(stale).toHaveLength(13);
    expect(stale[0]).toHaveAttribute("title", "needs review");
    expect(stale[0]).toHaveTextContent("needs review");
    expect(screen.getByTestId("library-source-state-not-compiled")).toHaveAttribute("title", "no wiki page");
    // Done is heard, not seen.
    expect(screen.getByTestId("library-source-state-compiled")).toHaveClass("sr-only");
    expect(screen.getByTestId("library-source-list-key")).toHaveTextContent("Waiting sources");
  });

  it("draws no key when every source has a page", () => {
    const sources = Array.from({ length: 3 }, (_, i) => source(i, "compiled"));
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(screen.queryByTestId("library-source-list-key")).toBeNull();
  });

  it("lists only the rows of the state the band's press names", () => {
    const sources = [source(0, "compiled"), source(1, "unreadable"), source(2, "checking"), source(3, "unreadable")];
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources", true, "unreadable");
    expect(list()).toHaveAttribute("data-state-filter", "unreadable");
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(2);
    cleanup();
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(4);
  });

  it("narrows to the folder picked on the home with a chip whose press clears it", () => {
    const sources = [source(0, "compiled"), source(1, "not-compiled"), source(2, "stale")];
    const onClear = vi.fn();
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources", true, null, {
      label: "Folder: decks",
      includes: (row) => row.path !== "sources/doc-0.md",
      onClear,
    });
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(2);
    const chip = screen.getByTestId("library-source-group-chip");
    expect(chip).toHaveTextContent("Folder: decks");
    chip.click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("the wiki shelf says its common caption once", () => {
  function pages(count: number, behind: boolean) {
    return Array.from({ length: count }, (_, i) => ({
      slug: `wiki/p${i}`,
      title: `Page ${i}`,
      sourcePaths: behind ? [`sources/s${i}.md`] : [],
      createdBy: "agent:claude",
      compiledAt: null,
    }));
  }

  it("past one screen of spines the majority caption is said above the shelf and those rows go quiet", () => {
    const stale = pages(13, true);
    const unverified = [{ slug: "wiki/fresh-one", title: "The one that differs", sourcePaths: [], createdBy: "agent:claude", compiledAt: null }];
    const writeUpsBySource = new Map(stale.map((page) => [page.sourcePaths[0], [{ slug: page.slug, title: page.title, freshness: "behind" }]]));
    const model = { ...BASE, wikiPages: [...stale, ...unverified], pairing: { originalsByWiki: new Map(), writeUpsBySource } } as unknown as LibraryUiModel;
    mount(model, "wiki");

    expect(screen.getByTestId("library-wiki-states")).toHaveTextContent("13 pages · Source review needed");
    // A folded spine keeps its words for a screen reader; the one exception says its own state in sight.
    const folded = screen.getByTestId("library-wiki-wiki/p0");
    expect(folded.textContent).toContain("Source review needed");
    expect(folded.querySelector(".sr-only")?.textContent).toContain("Source review needed");
    const exception = screen.getByTestId("library-wiki-wiki/fresh-one");
    expect(exception.querySelector(".sr-only")).toBeNull();
    expect(exception.textContent).toContain("Source not checked");
  });

  it("below one screen of spines nothing folds", () => {
    const stale = pages(5, true);
    const writeUpsBySource = new Map(stale.map((page) => [page.sourcePaths[0], [{ slug: page.slug, title: page.title, freshness: "behind" }]]));
    mount({ ...BASE, wikiPages: stale, pairing: { originalsByWiki: new Map(), writeUpsBySource } } as unknown as LibraryUiModel, "wiki");
    expect(screen.queryByTestId("library-wiki-states")).toBeNull();
    expect(screen.getByTestId("library-wiki-wiki/p0").querySelector(".sr-only")).toBeNull();
  });
});

/**
 * A door at the end of a sentence must not wear the sentence's ink: the link takes the accent while
 * the note stays tertiary.
 */
describe("the web note's door to the app is a door", () => {
  it("sets the link in the accent ink while the sentence stays tertiary", () => {
    mount({ ...BASE, sources: [source(0, "not-compiled")] } as LibraryUiModel, "wiki", false);
    const note = screen.getByTestId("library-compile-web-limit");
    const door = screen.getByTestId("library-compile-web-get-app");
    expect(note.className).toContain("--color-text-tertiary");
    expect(door.className).toContain("--color-indigo-accent");
    expect(door.className).not.toContain("--color-text-tertiary");
  });
});

/**
 * With no coding agent the installed app draws one notice with its door to the agents page instead
 * of two dead chips; while detection still runs, the doors stay.
 */
describe("the wiki head with no coding agent", () => {
  function NoAgent({ agentMissing }: { agentMissing: boolean }) {
    const t = useTranslations("library");
    return (
      <LibrarySection
        model={{ ...BASE, wikiPages: [{ slug: "wiki/a", title: "A", sourcePaths: [], createdBy: "agent:claude", compiledAt: null }] } as unknown as LibraryUiModel}
        selectedSlug={null}
        selectedSourcePath={null}
        onSelect={() => {}}
        onOpenSource={() => {}}
        sourceHandles={new Map()}
        vaultScope="test"
        onAddFiles={() => {}}
        onFindDocuments={() => {}}
        onImportFromService={() => {}}
        onCompile={null}
        onLint={null}
        onNewPage={null}
        report={null}
        segment="wiki"
        actionsNote="No verified coding agent is set up on this computer."
        inApp
        agentMissing={agentMissing}
        busy={false}
        t={t}
      />
    );
  }
  const mountNoAgent = (agentMissing: boolean) =>
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <NoAgent agentMissing={agentMissing} />
      </NextIntlClientProvider>,
    );

  it("draws one notice that names both jobs and ends in the agents door", () => {
    mountNoAgent(true);
    const notice = screen.getByTestId("library-agent-missing");
    expect(notice).toHaveTextContent("check the wiki");
    expect(screen.getByTestId("library-agent-missing-door")).toHaveAttribute("href", expect.stringContaining("agents"));
    expect(screen.queryByTestId("library-lint")).toBeNull();
    expect(screen.queryByTestId("library-compile")).toBeNull();
    // The reason is said once: the notice replaces the paragraph, it does not sit above it.
    expect(screen.queryByTestId("library-actions-blocked")).toBeNull();
  });

  it("keeps the doors and their reason while the runtimes are still being looked for", () => {
    mountNoAgent(false);
    expect(screen.queryByTestId("library-agent-missing")).toBeNull();
    expect(screen.getByTestId("library-lint")).toBeDisabled();
    expect(screen.getByTestId("library-actions-blocked")).toBeInTheDocument();
  });
});
