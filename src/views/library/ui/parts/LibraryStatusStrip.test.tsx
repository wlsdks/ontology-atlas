import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ko from "../../../../../messages/ko.json";
import type { LibraryUiModel } from "@/features/library";
import { LibraryStatusStrip } from "./LibraryStatusStrip";

/**
 * **"3 broken links" must mean three links.**
 *
 * The clause counted *pages* (measured 2026-09-09): a folder holding six broken links
 * across three pages said **3**. A person reading it goes looking for three, fixes those
 * three, and the header still says 3 — the number never moves toward zero because it was
 * never counting the thing it names.
 *
 * Its neighbour is genuinely per-page and stays that way: *off-template* is a property of
 * a page, and one page with four shape problems is still one row to open.
 */

type Verdict = LibraryUiModel["verdicts"] extends Map<string, infer V> ? V : never;

const verdict = (codes: readonly string[]): Verdict =>
  ({
    ok: codes.length === 0,
    firstProblem: codes[0] ?? null,
    firstProblemMessage: null,
    problemCount: codes.length,
    problems: codes.map((code) => ({ code, message: code })),
  }) as unknown as Verdict;

/** Only the fields the strip reads; a fuller fixture would be unverifiable against it. */
const model = (
  verdicts: Record<string, readonly string[]>,
  counts: Partial<Pick<LibraryUiModel, "needsCompileCount" | "notCompiledCount" | "staleCount" | "partialCount">> = {},
): LibraryUiModel =>
  ({
    sources: [{ state: "compiled" }],
    wikiPages: Object.keys(verdicts).map((slug) => ({ slug })),
    needsCompileCount: 0,
    notCompiledCount: 0,
    partialCount: 0,
    staleCount: 0,
    ...counts,
    verdicts: new Map(Object.entries(verdicts).map(([slug, codes]) => [slug, verdict(codes)])),
  }) as unknown as LibraryUiModel;

function Harness({ value }: { value: LibraryUiModel }) {
  const t = useTranslations("library");
  return <LibraryStatusStrip model={value} t={t} />;
}

const strip = (
  verdicts: Record<string, readonly string[]>,
  counts: Parameters<typeof model>[1] = {},
) => {
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <Harness value={model(verdicts, counts)} />
    </NextIntlClientProvider>,
  );
  return screen.getByTestId("library-status-strip").textContent ?? "";
};

describe("LibraryStatusStrip — the broken-link clause counts links", () => {
  it("counts six findings across three pages as six, not three", () => {
    const text = strip({
      "wiki/a": ["dangling-wikilink"],
      "wiki/b": ["dangling-wikilink", "dangling-wikilink"],
      "wiki/c": ["dangling-wikilink", "dangling-wikilink", "dangling-wikilink"],
    });
    expect(text).toContain("끊긴 링크 6개");
  });

  it("counts two findings on one page as two", () => {
    expect(strip({ "wiki/a": ["dangling-wikilink", "dangling-wikilink"] })).toContain(
      "끊긴 링크 2개",
    );
  });

  it("says nothing about links when every page's links resolve", () => {
    expect(strip({ "wiki/a": [], "wiki/b": [] })).not.toContain("끊긴 링크");
  });

  /*
   * `orphan-page` and `shared-source-unlinked` are true of a young wiki rather than of a
   * page, and the Check-the-wiki report is where a judgement about the whole wiki belongs.
   */
  it("leaves the advisory folder findings out of the count entirely", () => {
    const text = strip({
      "wiki/a": ["orphan-page", "shared-source-unlinked"],
      "wiki/b": ["orphan-page"],
    });
    expect(text).not.toContain("끊긴 링크");
  });
});

describe("LibraryStatusStrip — the off-template clause still counts pages", () => {
  it("counts one page carrying three shape problems as one", () => {
    const text = strip({
      "wiki/a": ["missing-field:title", "section-order", "uncited-fact"],
    });
    expect(text).toContain("서식 벗어남 1개");
  });

  it("counts the pages, not the problems, across a folder", () => {
    const text = strip({
      "wiki/a": ["section-order", "uncited-fact"],
      "wiki/b": ["section-order"],
    });
    expect(text).toContain("서식 벗어남 2개");
  });
});

/**
 * **The reader's header counts what the home counts.**
 *
 * Measured 2026-09-19 on the small wiki fixture: the home strip said *10 sources changed*
 * beside an index chip saying *not compiled 2*, and this strip, one press later, said
 * *12 waiting*. The sum was right and the sentence was a third opinion.
 */
describe("LibraryStatusStrip — the waiting clauses are the home's own", () => {
  it("prints not-compiled and changed apart, under the home's words, never their sum", () => {
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 12, notCompiledCount: 2, staleCount: 10 });
    expect(text).toContain("정리 전 2개");
    expect(text).toContain("원문 10개 달라짐");
    expect(text).not.toContain("기다림");
  });

  it("keeps the part-read count in its own clause", () => {
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 3, staleCount: 2, partialCount: 1 });
    expect(text).toContain("원문 2개 달라짐");
    expect(text).toContain("일부만 읽음 1개");
    expect(text).not.toContain("기다림");
  });

  it("names only the remainder the three states do not cover as waiting", () => {
    // Four sources Compile acts on; two not compiled, one changed, one compiled with a page to review.
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 4, notCompiledCount: 2, staleCount: 1 });
    expect(text).toContain("정리 전 2개");
    expect(text).toContain("원문 1개 달라짐");
    expect(text).toContain("1개 기다림");
  });
});

/**
 * **A thousand is written the same way on every surface** (2026-09-19, 3,000-file fixture).
 *
 * The index chip formatted by hand ("not compiled 1,400") while this strip and the home's
 * clauses printed the bare argument ("not compiled 1400", "1600 sources changed"): one
 * screen, two ways of writing the same number. A bare `{count}` is printed as typed; only
 * `{count, number}` and the plural forms group, which is why the English messages already
 * read "1,600".
 */
describe("LibraryStatusStrip — counts past a thousand are grouped", () => {
  it("groups the not-compiled and changed counts the way the index chip does", () => {
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 3000, notCompiledCount: 1400, staleCount: 1600 });
    expect(text).toContain("정리 전 1,400개");
    expect(text).toContain("원문 1,600개 달라짐");
    expect(text).not.toMatch(/\d{4}/);
  });
});

/**
 * **"Compile next" names its object, and a count the index shows is said once**
 * (design sweep, 2026-09-25). In the reader the strip read *Compile next · 2 not compiled*
 * while the home said *Compile next: chargeback-runbook.md* and the Sources index beside it
 * already said *not compiled 2*.
 */
describe("LibraryStatusStrip — the next step names its file", () => {
  const withSources = (indexShowsSourceStates: boolean) => {
    const value = {
      ...model({ "wiki/a": [] }, { needsCompileCount: 2, notCompiledCount: 2 }),
      sources: [
        { path: "sources/chargeback-runbook.md", state: "not-compiled" },
        { path: "sources/fee-schedule.csv", state: "not-compiled" },
      ],
    } as unknown as LibraryUiModel;
    function Strip() {
      const t = useTranslations("library");
      return <LibraryStatusStrip model={value} indexShowsSourceStates={indexShowsSourceStates} t={t} />;
    }
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <Strip />
      </NextIntlClientProvider>,
    );
    return screen.getByTestId("library-status-strip").textContent ?? "";
  };

  it("prints the file Compile would start on", () => {
    expect(withSources(false)).toContain("정리 다음: chargeback-runbook.md");
  });

  it("leaves the not-compiled count to the Sources index when it is beside the strip", () => {
    expect(withSources(true)).not.toContain("정리 전 2개");
  });

  it("keeps the count when the index shows the wiki", () => {
    expect(withSources(false)).toContain("정리 전 2개");
  });
});

/**
 * **One fact, one grammar** (2026-09-25). The home draws the next file as an accent link
 * that opens the Compile popover; the reader's strip printed the same words as text.
 */
describe("LibraryStatusStrip — the next file is the home's press", () => {
  it("draws the clause as a button that runs the same press, and keeps the rest as text", () => {
    const value = {
      ...model({ "wiki/a": ["section-order"] }, { needsCompileCount: 1, notCompiledCount: 1 }),
      sources: [{ path: "sources/chargeback-runbook.md", state: "not-compiled" }],
    } as unknown as LibraryUiModel;
    const onCompileNext = vi.fn();
    function Strip() {
      const t = useTranslations("library");
      return <LibraryStatusStrip model={value} indexShowsSourceStates onCompileNext={onCompileNext} compileOpen={false} t={t} />;
    }
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <Strip />
      </NextIntlClientProvider>,
    );
    const press = screen.getByTestId("library-status-compile");
    expect(press.tagName).toBe("BUTTON");
    expect(press.textContent).toBe("정리 다음: chargeback-runbook.md");
    expect(press.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(press);
    expect(onCompileNext).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("library-status-strip").textContent).toContain("서식 벗어남 1개");
  });
});

/**
 * **One file named by the lead clause is not counted again beside it** (2026-09-25).
 *
 * The page header read *Compile next: new-uncompiled-notes.md · 1 not compiled*, the same
 * single file twice, while the home strip a press away named it once.
 */
describe("LibraryStatusStrip — the named file is said once", () => {
  const withNotCompiled = (notCompiled: number) => {
    const sources = [
      { path: "sources/new-uncompiled-notes.md", state: "not-compiled" },
      ...Array.from({ length: notCompiled - 1 }, (_, i) => ({ path: `sources/other-${i}.md`, state: "not-compiled" })),
      { path: "sources/done.md", state: "compiled" },
    ];
    const value = {
      ...model({ "wiki/a": [] }, { needsCompileCount: notCompiled, notCompiledCount: notCompiled }),
      sources,
    } as unknown as LibraryUiModel;
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <Harness value={value} />
      </NextIntlClientProvider>,
    );
    return screen.getByTestId("library-status-strip").textContent ?? "";
  };

  it("drops the not-compiled count when it is the one file already named", () => {
    const text = withNotCompiled(1);
    expect(text).toContain("정리 다음: new-uncompiled-notes.md");
    expect(text).not.toContain("정리 전 1개");
  });

  it("keeps the count when it says more than the name", () => {
    expect(withNotCompiled(3)).toContain("정리 전 3개");
  });
});
