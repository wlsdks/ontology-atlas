import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LibraryUiModel } from "../../lib/use-library-model";
import { LibrarySection } from "./LibrarySection";

/**
 * **A state repeated on every row is said once, above the list** (installed app,
 * 2026-09-18: a freshly filled folder wore the same amber pill on 1,600 of 3,000 source
 * rows, and 400 wiki spines read the same *needs review · off template*). Below one
 * screen of rows nothing folds, which is what the sibling tests keep pinning row by row.
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
  pageTexts: new Map(),
  log: { lastCompile: null, lastLint: null },
  pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
} as unknown as LibraryUiModel;

function source(index: number, state: string) {
  return { path: `sources/doc-${index}.md`, name: `doc-${index}.md`, format: "md", bytes: 20, mtime: 1, state, citedBy: state === "not-compiled" ? [] : ["wiki/page"] };
}

function Harness({ model, segment }: { model: LibraryUiModel; segment: "sources" | "wiki" }) {
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
      onCompile={() => {}}
      onLint={() => {}}
      onNewPage={null}
      report={null}
      segment={segment}
      actionsNote={null}
      inApp={false}
      busy={false}
      t={t}
    />
  );
}

function mount(model: LibraryUiModel, segment: "sources" | "wiki") {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Harness model={model} segment={segment} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("the source list says its common state once", () => {
  it("past one screen of rows the majority state is a head count and the rows keep only exceptions", () => {
    const sources = [...Array.from({ length: 13 }, (_, i) => source(i, "stale")), source(13, "not-compiled")];
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");

    const head = screen.getByTestId("library-source-states");
    expect(head).toHaveAttribute("data-folded-state", "stale");
    expect(screen.getByTestId("library-source-states-stale")).toHaveTextContent("needs review · 13");
    expect(screen.getByTestId("library-source-states-not-compiled")).toHaveTextContent("not compiled 1");
    // Thirteen folded rows keep their word for a screen reader; no row wears the amber pill.
    expect(screen.getAllByTestId("library-source-state-folded")).toHaveLength(13);
    expect(screen.queryByTestId("library-source-state-stale")).toBeNull();
    // The one exception still wears its own badge on the row.
    expect(screen.getByTestId("library-source-state-not-compiled")).toBeInTheDocument();
  });

  it("below one screen of rows every row keeps its badge and the head only counts", () => {
    const sources = Array.from({ length: 5 }, (_, i) => source(i, "stale"));
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(screen.getByTestId("library-source-states")).not.toHaveAttribute("data-folded-state");
    expect(screen.getAllByTestId("library-source-state-stale")).toHaveLength(5);
    expect(screen.queryByTestId("library-source-state-folded")).toBeNull();
  });

  it("a tie between two states folds nothing", () => {
    const sources = [...Array.from({ length: 7 }, (_, i) => source(i, "stale")), ...Array.from({ length: 7 }, (_, i) => source(7 + i, "not-compiled"))];
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(screen.getByTestId("library-source-states")).not.toHaveAttribute("data-folded-state");
    expect(screen.queryByTestId("library-source-state-folded")).toBeNull();
  });

  it("compiled never folds: its check is already the quiet mark", () => {
    const sources = Array.from({ length: 14 }, (_, i) => source(i, "compiled"));
    mount({ ...BASE, sources } as unknown as LibraryUiModel, "sources");
    expect(screen.getByTestId("library-source-states")).not.toHaveAttribute("data-folded-state");
    expect(screen.getAllByTestId("library-source-state-compiled")).toHaveLength(14);
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
