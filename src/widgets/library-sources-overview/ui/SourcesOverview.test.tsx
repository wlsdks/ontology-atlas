import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { LibrarySourceRow, LibraryWikiPage } from "@/entities/docs-vault";

import en from "../../../../messages/en.json";
import { SourcesOverview, type SourcePick, type SourcesNextBatch } from "../index";

function row(path: string, state: LibrarySourceRow["state"] = "not-compiled"): LibrarySourceRow {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return { path, name, format: name.split(".").pop() ?? "", bytes: 1, mtime: 0, state, citedBy: [], compiledDay: -1 };
}

function folder(name: string, compiled: number, waiting: number): LibrarySourceRow[] {
  return Array.from({ length: compiled + waiting }, (_, i) => row(`sources/${name}/doc-${i}.md`, i < compiled ? "compiled" : "not-compiled"));
}

function nextBatch(sources: LibrarySourceRow[]): SourcesNextBatch {
  return { next: sources.filter((source) => source.state !== "compiled").slice(0, 10), running: new Set(), rest: 0 };
}

function Harness({ sources, pages = [], readingCount = null }: { sources: LibrarySourceRow[]; pages?: LibraryWikiPage[]; readingCount?: number | null }) {
  const [pick, setPick] = useState<SourcePick | null>(null);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <SourcesOverview
        sources={sources}
        pages={pages}
        batch={nextBatch(sources)}
        inApp
        readingCount={readingCount}
        pick={pick}
        onPick={setPick}
        onOpenPage={() => undefined}
        onOpenSource={() => undefined}
      />
    </NextIntlClientProvider>
  );
}

// In the order the table states; while rows glide their DOM order is the one before the re-sort.
const rowNames = () =>
  screen
    .getAllByTestId("sources-row")
    .sort((a, b) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex")))
    .map((element) => within(element).getByRole("button").textContent);

afterEach(cleanup);

describe("SourcesOverview", () => {
  it("names the real folder on a first day with one file directly in sources/", () => {
    render(<Harness sources={[row("sources/q4-planning-notes.md")]} />);
    expect(rowNames()).toEqual(["sources"]);
    expect(screen.queryByText(en.library.sourcesHome.topLevel)).toBeNull();
    expect(screen.getByTestId("sources-group-folder").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("sources-recent-steps")).toBeTruthy();
  });

  it("draws the rows of the first files counted while the folder is still being read", () => {
    const first = [...folder("alpha", 1, 2), ...folder("beta", 0, 1)];
    render(<Harness sources={first} readingCount={first.length} />);
    expect(rowNames()).toEqual(["alpha", "beta"]);
    expect(screen.getByTestId("sources-reading").textContent).toContain(String(first.length));
    // Five rows of Recently written are held while pages may still arrive.
    expect(screen.getByTestId("sources-recent").querySelector("ol")!.style.minHeight).toBe("220px");
  });

  it("sorts by Waiting at first and by a pressed header after, with aria-sort on the header", () => {
    render(<Harness sources={[...folder("few", 3, 1), ...folder("many", 0, 5), ...folder("mid", 1, 3)]} />);
    expect(rowNames()).toEqual(["many", "mid", "few"]);
    const waiting = screen.getByTestId("sources-sort-waiting");
    expect(waiting.closest('[role="columnheader"]')!.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(screen.getByTestId("sources-sort-name"));
    expect(screen.getByTestId("sources-sort-name").closest('[role="columnheader"]')!.getAttribute("aria-sort")).toBe("ascending");
    expect(waiting.closest('[role="columnheader"]')!.getAttribute("aria-sort")).toBe("none");
    expect(rowNames()).toEqual(["few", "many", "mid"]);
  });

  it("keeps the rows in their earlier DOM order while they glide to a new sort, so none is re-inserted", () => {
    render(<Harness sources={[...folder("few", 3, 1), ...folder("many", 0, 5), ...folder("mid", 1, 3)]} />);
    fireEvent.click(screen.getByTestId("sources-sort-name"));
    const domOrder = screen.getAllByTestId("sources-row");
    expect(domOrder.map((element) => within(element).getByRole("button").textContent)).toEqual(["many", "mid", "few"]);
    expect(domOrder.every((element) => element.classList.contains("motion-row-glide"))).toBe(true);
    expect(rowNames()).toEqual(["few", "many", "mid"]);
  });

  it("holds the row order while counts change and rows are not arriving", () => {
    const sources = [...folder("a", 0, 2), ...folder("b", 0, 1)];
    const { rerender } = render(<Harness sources={sources} />);
    expect(rowNames()).toEqual(["a", "b"]);
    const busier = [...sources, row("sources/b/new-1.md"), row("sources/b/new-2.md")];
    act(() => rerender(<Harness sources={busier} />));
    expect(rowNames()).toEqual(["a", "b"]);
  });

  it("picks a row on press and clears the pick on Escape", () => {
    render(<Harness sources={[...folder("a", 0, 2), ...folder("b", 1, 1)]} />);
    const [first] = screen.getAllByTestId("sources-row");
    fireEvent.click(first!);
    expect(first!.hasAttribute("data-picked")).toBe(true);
    expect(screen.getByTestId("sources-panel").textContent).toContain(en.library.sourcesHome.panel.waitingTitle);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getAllByTestId("sources-row")[0]!.hasAttribute("data-picked")).toBe(false);
  });

  it("shares one row among five alike folders", () => {
    const sources = ["b1", "b2", "b3", "b4", "b5"].flatMap((name) => folder(name, 2, 1));
    render(<Harness sources={[...sources, ...folder("other", 0, 4)]} />);
    expect(screen.getAllByTestId("sources-row")).toHaveLength(2);
    expect(screen.getByTestId("sources-meta").textContent).toBe("6 folders · the 5 with the same counts in every state share one row");
  });
});
