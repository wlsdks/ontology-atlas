import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "../../../../messages/en.json";
import ko from "../../../../messages/ko.json";
import {
  describeWikiProblem,
  groupWikiProblems,
  wikiProblemMachineLine,
  type WikiTemplateProblem,
} from "./describe-wiki-problem";

/**
 * **One describer, and the proof that it is one.**
 *
 * The function under test replaced three copies (`WikiTemplateProblems`,
 * `AnswerRevisionComparison`, `LibraryCheckReport`, carry-forward 2026-09-11). The reason
 * it had to become one is a person's, not an author's: they read a finding on the check
 * report, press the page's name, and must meet the same sentence beside the page.
 */

type Translate = Parameters<typeof describeWikiProblem>[1];

function translator(locale: "ko" | "en"): Translate {
  return createTranslator({
    locale,
    messages: locale === "ko" ? ko : en,
    namespace: "library",
  }) as unknown as Translate;
}

const UNCITED: WikiTemplateProblem = {
  code: "uncited-fact",
  message: "Every bullet under `## Facts` ends in at least one citation.",
  line: 31,
  detail: { key: "uncited-fact" },
};

const SHARED_SOURCE: WikiTemplateProblem = {
  code: "shared-source-unlinked",
  message: "`wiki/payments-01.md` also lists `sources/payments-ledger-01.html`.",
  detail: {
    key: "shared-source-unlinked",
    values: {
      other: "wiki/payments-01.md",
      sources: "`sources/payments-ledger-01.html`, `sources/ledger-appendix.md`",
    },
  },
};

describe("describeWikiProblem — what, where, what to do", () => {
  it("splits the retelling into the sentence and the action", () => {
    const words = describeWikiProblem(UNCITED, translator("ko"));
    expect(words.sentence).toBe("Facts의 31번째 줄에 근거가 없어요.");
    expect(words.action).toBe(
      "원문 한 곳을 달거나, 확인할 수 없으면 문서 끝에 있는 Not in sources 구획으로 옮기세요.",
    );
    expect(words.code).toBe("uncited-fact");
  });

  it("names the place in words, with the section the code is bound to", () => {
    const words = describeWikiProblem(UNCITED, translator("en"));
    expect(words.where).toEqual({
      label: "line 31 under Facts",
      // The same place with the section left off, for the second and later place in a row.
      lineLabel: "line 31",
      section: "Facts",
      line: 31,
    });
    expect(words.sentence).toBe("No original backs up what is written at line 31 under Facts.");
  });

  /*
   * The computed check report collapses findings that name one page and retell one
   * sentence into a single row carrying every line on its door (council 2026-09-12). A
   * line inside the sentence would make two identical findings two sentences and undo it.
   */
  it("drops the line from the sentence where the surface carries lines on the door", () => {
    const t = translator("ko");
    const first = describeWikiProblem(UNCITED, t, { place: "section" });
    const second = describeWikiProblem({ ...UNCITED, line: 32 }, t, { place: "section" });
    expect(first.sentence).toBe("Facts 구획에 근거가 없어요.");
    expect(first.sentence).toBe(second.sentence);
    // The line is still in the finding — it is just not in this sentence.
    expect(first.where?.line).toBe(31);
    expect(second.where?.line).toBe(32);
  });

  it("keeps the line where the code names no section, because two lines are two things", () => {
    const t = translator("ko");
    const bad = (line: number): WikiTemplateProblem => ({
      code: "bad-citation",
      message: "not a citation this format can resolve",
      line,
      detail: { key: "bad-citation", values: { text: "[[src:nope]]" } },
    });
    expect(describeWikiProblem(bad(4), t, { place: "section" }).sentence).not.toBe(
      describeWikiProblem(bad(9), t, { place: "section" }).sentence,
    );
  });
});

describe("describeWikiProblem — a name is a thing, not an address", () => {
  it("gives a page its title and an original its file name", () => {
    const words = describeWikiProblem(SHARED_SOURCE, translator("ko"), {
      pageTitle: (slug) => (slug === "wiki/payments-01" ? "Payments, January" : undefined),
    });
    expect(words.sentence).toBe(
      "Payments, January도 같은 원문(payments-ledger-01.html, ledger-appendix.md)을 쓰는데 두 문서가 서로를 가리키지 않아요.",
    );
    expect(words.targets).toEqual([
      { kind: "page", name: "Payments, January", id: "wiki/payments-01" },
      { kind: "source", name: "payments-ledger-01.html", id: "sources/payments-ledger-01.html" },
      { kind: "source", name: "ledger-appendix.md", id: "sources/ledger-appendix.md" },
    ]);
  });

  it("falls back to the page's own file name when no title is known", () => {
    const words = describeWikiProblem(SHARED_SOURCE, translator("ko"));
    expect(words.targets[0]).toEqual({
      kind: "page",
      name: "payments-01",
      id: "wiki/payments-01",
    });
  });

  it("puts every name back together into the plain sentence, in order", () => {
    const words = describeWikiProblem(SHARED_SOURCE, translator("en"));
    const rebuilt = words.segments
      .map((segment) =>
        segment.kind === "text"
          ? segment.text
          : segment.kind === "where"
            ? segment.where.label
            : segment.target.name,
      )
      .join("");
    expect(rebuilt).toBe(words.sentence);
  });
});

describe("describeWikiProblem — a key the catalogue has not learned yet", () => {
  it("degrades to the validator's English rather than a lookup path", () => {
    const words = describeWikiProblem(
      { code: "future-code", message: "Something new.", detail: { key: "not-yet" } },
      translator("ko"),
    );
    expect(words.sentence).toBe("Something new.");
    expect(words.action).toBeNull();
    expect(words.targets).toEqual([]);
  });

  it("degrades the same way with no detail at all", () => {
    const words = describeWikiProblem({ code: "legacy", message: "Older." }, translator("ko"));
    expect(words.sentence).toBe("Older.");
  });
});

describe("wikiProblemMachineLine — the disclosure's line stays the machine's", () => {
  it("carries the code, its line anchor and the English message verbatim", () => {
    expect(wikiProblemMachineLine(UNCITED)).toBe(
      "uncited-fact:31 — Every bullet under `## Facts` ends in at least one citation.",
    );
  });

  it("omits the anchor for a finding bound to no line", () => {
    expect(wikiProblemMachineLine({ code: "orphan-page", message: "No other page links here." })).toBe(
      "orphan-page — No other page links here.",
    );
  });
});

/**
 * **Every key the validator can emit has a retelling.** The failure this catches is the
 * one the owner read: a card falling back to the machine's English sentence, backticks
 * and citation grammar included, because nobody wrote the person's version.
 */
describe("the catalogue covers every finding the validator writes", () => {
  const KEYS = [
    "kind-present",
    "missing-field",
    "section-order-missing",
    "section-order-sequence",
    "uncited-fact",
    "bad-citation",
    "bad-truncation-record-shape",
    "bad-truncation-record-path",
    "citation-target-missing-folder",
    "citation-target-missing-sources",
    "describes-needs-approval",
    "dangling-wikilink",
    "orphan-page",
    "shared-source-unlinked",
  ] as const;

  for (const locale of ["ko", "en"] as const) {
    it(`${locale} has a what and a do for all ${KEYS.length} kinds, with no backtick`, () => {
      const problems = (locale === "ko" ? ko : en).library.wiki.problem as unknown as Record<
        string,
        { what?: string; do?: string }
      >;
      for (const key of KEYS) {
        const entry = problems[key];
        expect(entry?.what, `${locale} ${key}.what`).toBeTruthy();
        expect(entry?.do, `${locale} ${key}.do`).toBeTruthy();
        expect(entry!.what, `${locale} ${key}.what carries a backtick`).not.toContain("`");
        expect(entry!.do, `${locale} ${key}.do carries a backtick`).not.toContain("`");
      }
    });
  }
});

/**
 * **A door may be built only for a thing that is there.** Both of these were found in a
 * capture rather than in a test, which is why they are tests now.
 */
describe("describeWikiProblem — a name with nowhere to go is words", () => {
  it("never doors the file a citation-target finding says is not in the folder", () => {
    const words = describeWikiProblem(
      {
        code: "citation-target-missing",
        message: "`sources/gone.md` is cited but is not in this folder.",
        detail: { key: "citation-target-missing-folder", values: { path: "sources/gone.md" } },
      },
      translator("en"),
    );
    expect(words.sentence).toContain("gone.md");
    expect(words.targets).toEqual([]);
  });

  it("does door the original a page cites but forgot to list, because it is there", () => {
    const words = describeWikiProblem(
      {
        code: "citation-target-missing",
        message: "`sources/here.md` is cited but is not listed.",
        detail: { key: "citation-target-missing-sources", values: { path: "sources/here.md" } },
      },
      translator("en"),
    );
    expect(words.targets).toEqual([
      { kind: "source", name: "here.md", id: "sources/here.md" },
    ]);
  });
});

describe("groupWikiProblems — one row per thing to fix", () => {
  const uncited = (line: number): WikiTemplateProblem => ({
    code: "uncited-fact",
    message: "Every bullet under `## Facts` ends in at least one citation.",
    line,
    detail: { key: "uncited-fact" },
  });

  it("folds two bullets with one sentence into one row carrying both places", () => {
    const rows = groupWikiProblems([uncited(19), uncited(20)], translator("ko"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.places.map((place) => place.line)).toEqual([19, 20]);
    // The disclosure still enumerates both, because that is the machine's own count.
    expect(rows[0]!.problems).toHaveLength(2);
  });

  it("keeps two findings apart when they do not read the same", () => {
    const rows = groupWikiProblems(
      [uncited(19), { code: "orphan-page", message: "No other page links here.", detail: { key: "orphan-page" } }],
      translator("ko"),
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps two findings apart when they name different things", () => {
    const other = (path: string): WikiTemplateProblem => ({
      code: "shared-source-unlinked",
      message: "also lists",
      detail: { key: "shared-source-unlinked", values: { other: path, sources: "`sources/a.md`" } },
    });
    expect(groupWikiProblems([other("wiki/a.md"), other("wiki/b.md")], translator("ko"))).toHaveLength(2);
  });
});
