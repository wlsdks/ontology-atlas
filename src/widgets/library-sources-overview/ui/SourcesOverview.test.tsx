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

function nextBatch(sources: readonly LibrarySourceRow[], running: ReadonlySet<string> = new Set()): SourcesNextBatch {
  return { next: sources.filter((source) => source.state !== "compiled").slice(0, 10), running, rest: 0 };
}

let renders = 0;

function Harness({
  sources,
  pages = [],
  readingCount = null,
  batch,
}: {
  sources: readonly LibrarySourceRow[];
  pages?: LibraryWikiPage[];
  readingCount?: number | null;
  batch?: SourcesNextBatch;
}) {
  const [pick, setPick] = useState<SourcePick | null>(null);
  // Each render is a first arrival: a folder seen once draws its bars at once afterwards.
  const [scope] = useState(() => `folder-${(renders += 1)}`);
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <SourcesOverview
        scope={scope}
        sources={sources}
        pages={pages}
        batch={batch ?? nextBatch(sources)}
        readingCount={readingCount}
        pick={pick}
        onPick={setPick}
        onOpenPage={() => undefined}
        onOpenSource={() => undefined}
      />
    </NextIntlClientProvider>
  );
}

const byRowIndex = (a: Element, b: Element) => Number(a.getAttribute("aria-rowindex")) - Number(b.getAttribute("aria-rowindex"));

// In the order the table states; while rows glide their DOM order is the one before the change.
const rowNames = () => screen.getAllByTestId("sources-row").sort(byRowIndex).map((element) => within(element).getByRole("button").textContent);

const rowOf = (name: string) => screen.getAllByTestId("sources-row").find((element) => within(element).getByRole("button").textContent?.startsWith(name))!;

afterEach(cleanup);

describe("SourcesOverview", () => {
  it("names the real folder on a first day with one file directly in sources/", () => {
    render(<Harness sources={[row("sources/q4-planning-notes.md")]} />);
    expect(rowNames()).toEqual(["sources"]);
    expect(screen.queryByText(en.library.sourcesHome.topLevel)).toBeNull();
    expect(screen.getByTestId("sources-group-folder").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("sources-recent-steps")).toBeTruthy();
    expect(screen.getByTestId("sources-meta").textContent).toBe("1 folder · 1 source");
  });

  it("reads by file type when the files sit in one first-level folder beside sources/ itself", () => {
    render(<Harness sources={[row("sources/loose.pdf"), row("sources/only/a.md"), row("sources/only/b.md")]} />);
    expect(screen.getByTestId("sources-group-type").getAttribute("aria-checked")).toBe("true");
  });

  it("draws the rows of the first files counted while the folder is still being read", () => {
    const first = [...folder("alpha", 1, 2), ...folder("beta", 0, 1)];
    render(<Harness sources={first} readingCount={first.length} />);
    expect(rowNames()).toEqual(["alpha", "beta"]);
    expect(screen.getByTestId("sources-reading").textContent).toContain(String(first.length));
    // Five rows of Recently written are held while pages may still arrive.
    expect(screen.getByTestId("sources-recent").querySelector("ol")!.style.minHeight).toBe("260px");
  });

  it("sorts the rows of the publish that ends the read", () => {
    const a = folder("a", 0, 1);
    const { rerender } = render(<Harness sources={a} readingCount={a.length} />);
    const all = [...a, ...folder("b", 0, 5)];
    act(() => rerender(<Harness sources={all} readingCount={null} />));
    expect(rowNames()).toEqual(["b", "a"]);
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

  it("keeps the rows in their earlier DOM order while they glide to a re-sort, so none is re-inserted", () => {
    render(<Harness sources={[...folder("few", 3, 1), ...folder("many", 0, 5), ...folder("mid", 1, 3)]} />);
    fireEvent.click(screen.getByTestId("sources-sort-name"));
    const domOrder = screen.getAllByTestId("sources-row");
    expect(domOrder.map((element) => within(element).getByRole("button").textContent)).toEqual(["many", "mid", "few"]);
    expect(domOrder.map((element) => element.style.translate)).toEqual(["0 48px", "0 96px", "0 0px"]);
  });

  it("holds the row order while counts change and rows are not arriving", () => {
    const sources = [...folder("a", 0, 2), ...folder("b", 0, 1)];
    const { rerender } = render(<Harness sources={sources} />);
    expect(rowNames()).toEqual(["a", "b"]);
    const busier = [...sources, row("sources/b/new-1.md"), row("sources/b/new-2.md")];
    act(() => rerender(<Harness sources={busier} />));
    expect(rowNames()).toEqual(["a", "b"]);
  });

  it("keeps an alike row's key and place when a batch pulls one of its folders out", () => {
    const sources = [...["z1", "z2", "z3", "z4", "z5", "z6"].flatMap((name) => folder(name, 0, 3)), ...["a1", "a2", "a3", "a4", "a5"].flatMap((name) => folder(name, 0, 2))];
    const { rerender } = render(<Harness sources={sources} />);
    const before = screen.getAllByTestId("sources-row").map((element) => `${element.getAttribute("data-key")}#${element.getAttribute("aria-rowindex")}`);
    act(() => rerender(<Harness sources={sources} batch={nextBatch(sources, new Set(["sources/z1/doc-0.md"]))} />));
    const after = screen.getAllByTestId("sources-row").map((element) => `${element.getAttribute("data-key")}#${element.getAttribute("aria-rowindex")}`);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(rowNames().at(-1)).toBe("z1");
  });

  it("fades a row that leaves where it was, hidden from assistive technology", () => {
    const sources = [...folder("a", 0, 2), ...folder("b", 0, 1)];
    const { rerender } = render(<Harness sources={sources} />);
    act(() => rerender(<Harness sources={folder("a", 0, 2)} />));
    const leaving = screen.getByTestId("sources-row-leaving");
    expect(leaving.getAttribute("aria-hidden")).toBe("true");
    expect(leaving.style.translate).toBe("0 48px");
    expect(rowNames()).toEqual(["a"]);
  });

  it("picks a row on press and clears the pick on Escape", () => {
    render(<Harness sources={[...folder("a", 0, 2), ...folder("b", 1, 1)]} />);
    fireEvent.click(rowOf("a"));
    expect(rowOf("a").hasAttribute("data-picked")).toBe(true);
    expect(screen.getByTestId("sources-panel").textContent).toContain(en.library.sourcesHome.panel.waitingTitle);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(rowOf("a").hasAttribute("data-picked")).toBe(false);
  });

  it("keeps a picked alike row picked when one of its folders changes and leaves it", () => {
    const alike = ["b1", "b2", "b3", "b4", "b5", "b6"].flatMap((name) => folder(name, 2, 1));
    const { rerender } = render(<Harness sources={alike} />);
    expect(screen.getAllByTestId("sources-row")).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId("sources-row")[0]!);
    act(() => rerender(<Harness sources={[...alike, row("sources/b6/new.md")]} />));
    const shared = screen.getAllByTestId("sources-row").find((element) => element.getAttribute("data-key")!.startsWith("alike:"))!;
    expect(shared.hasAttribute("data-picked")).toBe(true);
  });

  it("says once that a picked folder left, and clears that line on the next pick", () => {
    const sources = [...folder("a", 0, 2), ...folder("b", 0, 1)];
    const { rerender } = render(<Harness sources={sources} />);
    fireEvent.click(rowOf("b"));
    act(() => rerender(<Harness sources={folder("a", 0, 2)} />));
    expect(screen.getByTestId("sources-pick-gone")).toBeTruthy();
    fireEvent.click(rowOf("a"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("sources-pick-gone")).toBeNull();
  });

  it("lists Next to write in the batch's order and moves up by one when a file gets its page", () => {
    const files = folder("queue", 0, 11);
    const { rerender } = render(<Harness sources={files} batch={{ next: files.slice(0, 10), running: new Set(), rest: 1 }} />);
    const listed = () => screen.getAllByTestId("sources-panel-file").map((element) => element.getAttribute("title"));
    expect(listed()).toEqual(files.slice(0, 10).map((file) => file.path));
    const written = files.map((file, i) => (i === 0 ? { ...file, state: "compiled" as const } : file));
    act(() => rerender(<Harness sources={written} batch={{ next: files.slice(1, 11), running: new Set(), rest: 0 }} />));
    expect(listed()).toEqual(files.slice(1, 11).map((file) => file.path));
  });

  it("tints the file being written and passes a reading scan down its sheet, saying so to a screen reader", () => {
    const files = folder("queue", 0, 3);
    render(<Harness sources={files} batch={{ next: files, running: new Set([files[0]!.path]), rest: 0 }} />);
    const [reading, waiting] = screen.getAllByTestId("sources-panel-file");
    expect(reading!.getAttribute("data-writing")).toBe("true");
    expect(reading!.querySelector(".motion-sheet-scan")).not.toBeNull();
    expect(reading!.textContent).toContain(en.library.sourcesHome.writing);
    expect(waiting!.querySelector(".motion-sheet-scan")).toBeNull();
  });

  it("shares one row among five alike folders", () => {
    const sources = ["b1", "b2", "b3", "b4", "b5"].flatMap((name) => folder(name, 2, 1));
    render(<Harness sources={[...sources, ...folder("other", 0, 4)]} />);
    expect(screen.getAllByTestId("sources-row")).toHaveLength(2);
  });
});
