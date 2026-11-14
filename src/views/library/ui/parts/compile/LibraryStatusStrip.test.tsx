import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ko from "../../../../../../messages/ko.json";
import type { LibraryUiModel } from "@/features/library";
import { LibraryStatusStrip } from "./LibraryStatusStrip";

/**
 * The broken-links clause counts links, not pages; off-template stays per page, since one page with
 * four shape problems is still one row to open.
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
 * The reader's header counts what the home counts: not-compiled and changed are printed apart under
 * the home's words, never summed.
 */
describe("LibraryStatusStrip — the waiting clauses are the home's own", () => {
  it("prints not-compiled and changed apart, under the home's words, never their sum", () => {
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 12, notCompiledCount: 2, staleCount: 10 });
    expect(text).toContain("위키 문서 없음 2개");
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
    expect(text).toContain("위키 문서 없음 2개");
    expect(text).toContain("원문 1개 달라짐");
    expect(text).toContain("1개 기다림");
  });
});

/**
 * A count past a thousand is grouped the same way on every surface: a bare `{count}` prints as
 * typed, only `{count, number}` and plural forms group.
 */
describe("LibraryStatusStrip — counts past a thousand are grouped", () => {
  it("groups the not-compiled and changed counts the way the index chip does", () => {
    const text = strip({ "wiki/a": [] }, { needsCompileCount: 3000, notCompiledCount: 1400, staleCount: 1600 });
    expect(text).toContain("위키 문서 없음 1,400개");
    expect(text).toContain("원문 1,600개 달라짐");
    expect(text).not.toMatch(/\d{4}/);
  });
});

/** Compile next names its object, and a count the index already shows is said once. */
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
    expect(withSources(false)).toContain("위키 문서 만들기: chargeback-runbook.md");
  });

  it("leaves the not-compiled count to the Sources index when it is beside the strip", () => {
    expect(withSources(true)).not.toContain("위키 문서 없음 2개");
  });

  it("keeps the count when the index shows the wiki", () => {
    expect(withSources(false)).toContain("위키 문서 없음 2개");
  });
});

/**
 * The next file is the home's press: a button that opens the Compile popover, with the rest of the
 * strip as text.
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
    expect(press.textContent).toBe("위키 문서 만들기: chargeback-runbook.md");
    expect(press.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(press);
    expect(onCompileNext).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("library-status-strip").textContent).toContain("서식 벗어남 1개");
  });
});

/** A file named by the lead clause is not counted again beside it. */
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
    expect(text).toContain("위키 문서 만들기: new-uncompiled-notes.md");
    expect(text).not.toContain("위키 문서 없음 1개");
  });

  it("keeps the count when it says more than the name", () => {
    expect(withNotCompiled(3)).toContain("위키 문서 없음 3개");
  });
});
