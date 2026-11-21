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
  structural: { unmeasured: [], findingCount: 0 },
} as unknown as LibraryUiModel;

function source(index: number, state: string) {
  return { path: `sources/doc-${index}.md`, name: `doc-${index}.md`, format: "md", bytes: 20, mtime: 1, state, citedBy: state === "not-compiled" ? [] : ["wiki/page"] };
}

function Harness({ model, segment, stateFilter = null, groupFilter = null }: { model: LibraryUiModel; segment: "sources" | "wiki"; stateFilter?: string | null; groupFilter?: SourceGroupFilter | null }) {
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
      segment={segment}
      busy={false}
      stateFilter={stateFilter as never}
      groupFilter={groupFilter}
      t={t}
    />
  );
}

function mount(model: LibraryUiModel, segment: "sources" | "wiki", stateFilter: string | null = null, groupFilter: SourceGroupFilter | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Harness model={model} segment={segment} stateFilter={stateFilter} groupFilter={groupFilter} />
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
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources", "unreadable");
    expect(list()).toHaveAttribute("data-state-filter", "unreadable");
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(2);
    cleanup();
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(4);
  });

  it("narrows to the folder picked on the home with a chip whose press clears it", () => {
    const sources = [source(0, "compiled"), source(1, "not-compiled"), source(2, "stale")];
    const onClear = vi.fn();
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources", null, {
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

  it("says so when a state press and a picked folder leave no row, and offers to clear the pick", () => {
    const sources = [source(0, "compiled"), source(1, "stale")];
    const onClear = vi.fn();
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources", "stale", {
      label: "Folder: decks",
      includes: (row) => row.path === "sources/doc-0.md",
      onClear,
    });
    expect(list().querySelectorAll("li > button[data-row-index]")).toHaveLength(0);
    expect(screen.getByTestId("library-source-list-none-note")).toHaveTextContent("None of these sources is in that state.");
    screen.getByTestId("library-source-list-none-clear").click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
