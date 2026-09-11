import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/appearance-preferences";
import type { LibraryUiModel } from "../../lib/use-library-model";
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
  pageTexts: new Map(),
  log: { lastCompile: null, lastLint: null },
  /* The shelf reads its freshness from the pairing, so a model without one is not a model. */
  pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
} as unknown as LibraryUiModel;

function Harness({ onNewPage = null, report = null }: { onNewPage?: ((title: string) => void) | null; report?: { count: number; open: boolean; onOpen: () => void } | null }) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={MODEL}
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
      onNewPage={onNewPage}
      report={report}
      /* The doors and the list are the wiki half of the column; the switch above it decides. */
      segment="wiki"
      compileNote={null}
      busy={false}
      t={t}
    />
  );
}

function HarnessWith({ model }: { model: LibraryUiModel }) {
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
      segment="wiki"
      compileNote={null}
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

describe("the wiki half of the column is an index: search, three doors, the list", () => {
  it("filters the list from one field and says what matched", () => {
    mount(<Harness />);
    const rows = () => screen.getByTestId("library-wiki-list").querySelectorAll('[data-testid^="library-wiki-wiki/"]');
    expect(rows()).toHaveLength(2);
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "b" } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByTestId("library-search-matches").textContent).toContain("1 page");
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

  it("holds nothing but the index: no findings, no names, no write switch, no log line (owner, 2026-09-07)", () => {
    mount(<Harness onNewPage={vi.fn()} />);
    for (const id of ["library-finding", "library-candidate", "library-write-mode", "library-file-answer", "library-wiki-log"]) {
      expect(screen.queryByTestId(id)).toBeNull();
    }
    // Two agent doors on one row; New page is the list's own last row, not a door.
    expect(screen.getByTestId("library-lint")).toBeInTheDocument();
    expect(screen.getByTestId("library-compile")).toBeInTheDocument();
    const list = screen.getByTestId("library-wiki-list");
    expect(list.contains(screen.getByTestId("library-new-page"))).toBe(true);
  });

  it("names the writer only on the pages that are the exception", () => {
    const withPerson = {
      ...MODEL,
      wikiPages: [
        ...MODEL.wikiPages,
        { slug: "wiki/c", title: "C", sourcePaths: [], createdBy: "human", compiledAt: null },
      ],
    } as unknown as LibraryUiModel;
    mount(<HarnessWith model={withPerson} />);
    /*
     * The rule is unchanged and its carrier moved with the list's shape: a 26px spine has
     * no room for a caption, so the exception is named in the accessible name the spine
     * already has to carry (the whole title truncates there too). The majority writer
     * stays silent either way — nine identical labels are texture, and the one that says
     * a person is the fact (design-lead, council 2026-09-07).
     */
    const named = ["wiki/a", "wiki/b", "wiki/c"].filter((slug) =>
      screen.getByTestId(`library-wiki-${slug}`).getAttribute("aria-label")?.includes("a person"),
    );
    expect(named).toEqual(["wiki/c"]);
    // And on the row shape a search puts back, it is the caption it always was.
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "c" } });
    const labels = screen.getAllByTestId("library-wiki-writer");
    expect(labels).toHaveLength(1);
    expect(labels[0]!.textContent).toContain("a person");
  });

  it("says where the check's answer is with one row above the list, only once the wiki was checked", () => {
    const onOpen = vi.fn();
    const { rerender } = mount(<Harness />);
    expect(screen.queryByTestId("library-open-report")).toBeNull();
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Harness report={{ count: 6, open: false, onOpen }} />
      </NextIntlClientProvider>,
    );
    const row = screen.getByTestId("library-open-report");
    expect(row.textContent).toContain("Check results 6");
    fireEvent.click(row);
    expect(onOpen).toHaveBeenCalledTimes(1);
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
        onCompile={() => {}}
        onLint={() => {}}
        onNewPage={null}
        report={null}
        segment="sources"
        compileNote={null}
        busy={false}
        t={t}
      />
    );
  }

  it("names the matches on the other list and switches there, instead of an empty list under a count", () => {
    // Browser walkthrough 2026-09-07: "sources 0 · pages 6" stood over nothing, and the
    // person had to know to press the other half of the switch.
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
