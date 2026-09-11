import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/appearance-preferences";
import type { LibraryUiModel } from "../../lib/use-library-model";
import { LibrarySection } from "./LibrarySection";

/**
 * The shelf, measured where a browser cannot be asked: which mark each page wears, that a
 * search puts the rows back, and that Compile's light really steps from spine to spine
 * rather than sitting on one — the sequence a screenshot can show a frame of but not
 * prove.
 */

const PAGES = [
  { slug: "wiki/plan", title: "Quarter plan", sourcePaths: ["sources/plan.pdf"], createdBy: "agent:claude", compiledAt: null },
  { slug: "wiki/budget", title: "Budget review", sourcePaths: ["sources/budget.xlsx"], createdBy: "agent:claude", compiledAt: null },
  { slug: "wiki/handover", title: "Handover notes", sourcePaths: [], createdBy: "agent:claude", compiledAt: null },
];

const MODEL = {
  sources: [],
  wikiPages: PAGES,
  needsCompileCount: 0,
  notCompiledCount: 0,
  staleCount: 0,
  partialCount: 0,
  pathsNeedingHash: [],
  verdicts: new Map(),
  offTemplateCount: 0,
  hashes: new Map(),
  pageTexts: new Map([
    ["wiki/plan", "x".repeat(200)],
    ["wiki/budget", "x".repeat(5_000)],
  ]),
  log: { lastCompile: null, lastLint: null },
  pairing: {
    originalsByWiki: new Map(),
    writeUpsBySource: new Map([
      ["sources/plan.pdf", [{ slug: "wiki/plan", title: "Quarter plan", freshness: "current" }]],
      ["sources/budget.xlsx", [{ slug: "wiki/budget", title: "Budget review", freshness: "behind" }]],
    ]),
  },
} as unknown as LibraryUiModel;

function Harness({
  compiling = false,
  selectedSlug = null,
  onSelect = () => {},
}: {
  compiling?: boolean;
  selectedSlug?: string | null;
  onSelect?: (slug: string) => void;
}) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={MODEL}
      selectedSlug={selectedSlug}
      selectedSourcePath={null}
      onSelect={onSelect}
      onOpenSource={() => {}}
      sourceHandles={new Map()}
      vaultScope="test"
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onCompile={() => {}}
      onLint={() => {}}
      onNewPage={() => {}}
      segment="wiki"
      actionsNote={null}
      inApp={false}
      busy={false}
      compiling={compiling}
      t={t}
    />
  );
}

function mount(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={enMessages}>{node}</NextIntlClientProvider>);
}

afterEach(() => {
  vi.useRealTimers();
});

/*
 * The index's search field now remembers what was typed for as long as the tab lives, so a
 * door to `/agents` and back does not cost a retype (slice U2). That memory is this
 * module's, so inside one test file a case that types a query would otherwise hand it to
 * the next case's mount. Emptying the field is what the product calls to forget it.
 */
beforeEach(() => {
  writeLibraryIndexQuery("", "");
});

describe("the wiki list at rest is a shelf, and every spine carries its freshness", () => {
  it("shows the source state in the horizontal row, without asking people to hover a vertical title", () => {
    mount(<Harness />);

    expect(screen.getByTestId("library-wiki-wiki/budget")).toHaveTextContent("Budget review");
    expect(screen.getByText("Source review needed")).toBeInTheDocument();
  });

  it("draws one spine per page, each with the state the folder derived", () => {
    mount(<Harness />);
    expect(screen.getByTestId("library-wiki-shelf")).toBeInTheDocument();
    expect(screen.getByTestId("library-wiki-wiki/plan")).toHaveAttribute("data-freshness", "fresh");
    expect(screen.getByTestId("library-wiki-wiki/budget")).toHaveAttribute("data-freshness", "stale");
    // A page citing nothing has never been checked against a file, and says so rather
    // than borrowing the look of one that was.
    expect(screen.getByTestId("library-wiki-wiki/handover")).toHaveAttribute(
      "data-freshness",
      "unverified",
    );
  });

  /*
   * ⚠️ **The amber rims were deleted on 2026-09-09, both of them.**
   *
   * They shipped as a full-bleed bar across the row's head and foot over an amber border
   * around the card, and the owner read the head bar as *"that yellow line looks so AI"*.
   * The first repair moved the same bar to the row's start edge and got the same reading:
   * *"what even is that line on the left… do it our way."* Our way is written down —
   * `docs/DESIGN-SYSTEM.md` lists **full-height coloured rails** among the canonical
   * Don'ts and prescribes a neutral surface with a small marker and a label — and a rail
   * moved from one edge to another is still a rail.
   *
   * So the state is a word on the caption line that already carried it, with one dot in
   * front of the rows a person can act on. These cases pin that the dot stays a state and
   * not a texture: exactly the rows that need work wear it.
   *
   * ⚠️ **And "can act on" is the page's own defect, not staleness** (guardian,
   * 2026-09-09). The first shape was `stale || ownProblem`, which on the owner's folder
   * put the warning ink on 3 of 3 rows — staleness is the resting state of a folder
   * somebody is working in, so the union trends to every row. Nothing on this shelf has a
   * template problem, so nothing here wears a dot; the state is still in words on every
   * row and in every accessible name, and `library.spec.ts` holds the positive case on a
   * page that really does miss the template.
   */
  it("leaves a stale page's dot off, because staleness is where a live folder rests", () => {
    mount(<Harness />);
    expect(screen.queryAllByTestId("library-spine-attention-dot")).toHaveLength(0);
    // The fact itself did not move — it is on the row, in words, where it always was.
    expect(screen.getByTestId("library-wiki-wiki/budget").textContent).toContain(
      "Source review needed",
    );
  });

  it("draws no coloured rail on any row", () => {
    mount(<Harness />);
    expect(screen.queryByTestId("library-spine-stale-rim")).toBeNull();
    expect(screen.queryByTestId("library-spine-off-template-rim")).toBeNull();
  });

  /*
   * A page nothing has checked is not a page with something wrong: nobody has started.
   * It keeps the quiet border for the same reason it gets no dot.
   */
  it("leaves an unverified page unmarked, because nothing is wrong there", () => {
    mount(<Harness />);
    expect(
      screen
        .getByTestId("library-wiki-wiki/handover")
        .querySelector('[data-testid="library-spine-attention-dot"]'),
    ).toBeNull();
  });

  it("says the state in words on the row itself, not only in its accessible name", () => {
    mount(<Harness />);
    expect(screen.getByTestId("library-wiki-wiki/budget").textContent).toContain(
      "Source review needed",
    );
  });

  it("uses one readable row shape regardless of page length", () => {
    mount(<Harness />);
    for (const slug of ["plan", "budget", "handover"]) {
      const row = screen.getByTestId(`library-wiki-wiki/${slug}`);
      expect(row.textContent).not.toBeNull();
      expect(row.querySelector("[data-spine-title]")).toBeNull();
      expect(row.className).not.toContain("writing-mode");
    }
  });

  it("carries the whole title and the state in words, because a spine truncates", () => {
    mount(<Harness />);
    const spine = screen.getByTestId("library-wiki-wiki/budget");
    expect(spine.getAttribute("aria-label")).toContain("Budget review");
    expect(spine.getAttribute("aria-label")).toContain("The source has changed or has not been checked against this page.");
    expect(spine.getAttribute("title")).toContain("Budget review");
  });

  it("opens the page it is pressed on", () => {
    const onSelect = vi.fn();
    mount(<Harness onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId("library-wiki-wiki/plan"));
    expect(onSelect).toHaveBeenCalledWith("wiki/plan");
  });

  it("marks the open page and only it", () => {
    mount(<Harness selectedSlug="wiki/plan" />);
    expect(screen.getByTestId("library-wiki-wiki/plan")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("library-wiki-wiki/budget")).not.toHaveAttribute("aria-current");
  });

  it("puts the rows back while a search is running — an answer reads down a column", () => {
    mount(<Harness />);
    fireEvent.change(screen.getByTestId("library-search"), { target: { value: "plan" } });
    expect(screen.queryByTestId("library-wiki-shelf")).toBeNull();
    expect(screen.getByTestId("library-wiki-list").querySelectorAll("li")).toHaveLength(2);
  });
});

describe("Compile marks the shelf, never one book on it", () => {
  it("states the turn on the board and in words, and puts no light on a spine", () => {
    vi.useFakeTimers();
    const { rerender } = mount(<Harness compiling />);
    expect(screen.getByTestId("library-shelf-compiling")).toBeInTheDocument();
    expect(screen.getByTestId("library-wiki-list")).toHaveAttribute("data-compiling", "board");
    expect(screen.getByTestId("library-wiki-shelf")).toHaveAttribute("aria-busy", "true");
    // No clock: a light that rested on one spine at a time measured 1.29:1 against the
    // open page's own fill and claimed a per-page progress nothing here holds.
    act(() => void vi.advanceTimersByTime(2_000));
    expect(document.querySelectorAll("[data-sweep]")).toHaveLength(0);
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Harness compiling={false} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("library-shelf-compiling")).toBeNull();
    expect(screen.getByTestId("library-wiki-list")).not.toHaveAttribute("data-compiling");
  });

  it("reads the same with reduced motion, because nothing moved to begin with", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("prefers-reduced-motion"),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    try {
      mount(<Harness compiling />);
      expect(screen.getByTestId("library-wiki-list")).toHaveAttribute("data-compiling", "board");
      expect(screen.getByTestId("library-shelf-compiling")).toBeInTheDocument();
      expect(screen.getByTestId("library-shelf-board")).toBeInTheDocument();
    } finally {
      matchMedia.mockRestore();
    }
  });
});
