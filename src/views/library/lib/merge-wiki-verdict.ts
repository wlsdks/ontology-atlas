/**
 * One finding as the surfaces carry it.
 *
 * `message` is the validator's English, kept because the CLI and `validate_wiki` print
 * exactly this and an agent branches on the code beside it. `detail` is the same
 * sentence's pieces, so a reader can be handed it in their own language instead of an
 * English paragraph under a Korean heading (2026-09-09).
 */
export interface WikiProblemLike {
  code: string;
  message: string;
  line?: number;
  detail?: { key: string; values?: Record<string, string> };
}

export interface WikiVerdictLike {
  ok: boolean;
  firstProblem: string | null;
  firstProblemMessage: string | null;
  problemCount: number;
  problems: ReadonlyArray<WikiProblemLike>;
}

/**
 * Folder findings that describe the wiki's shape rather than a page's own: no other page
 * links here yet, or another page was written from a source this page also lists. They
 * stay on the row and reach the Check-the-wiki brief, but they do not make a page
 * "off-template" — in a two-page wiki with no links yet every page is an orphan, and a
 * list where every row wears the warning says nothing (library e2e, 2026-09-07).
 */
const ADVISORY_CODES: ReadonlySet<string> = new Set(["orphan-page", "shared-source-unlinked"]);

const FOLDER_CODES: ReadonlySet<string> = new Set([
  "dangling-wikilink",
  "orphan-page",
  "shared-source-unlinked",
]);

/**
 * Whether a code describes the **wiki's shape** rather than one page's own text.
 *
 * The row draws the two apart (2026-09-07): a page that misses the template wears the
 * amber pill it always has, because the fix is in that page's own bytes; a folder finding
 * — a link that goes nowhere, a page nothing links to, a source two pages share without
 * linking — is a quiet word instead. A pill on every row for a folder-wide fact is the
 * texture the `compiled` badge was removed for, one list further down.
 */
export function isWikiFolderCode(code: string): boolean {
  return FOLDER_CODES.has(code);
}

/**
 * Whether a folder code is **advisory** — true of the wiki's youth rather than of a page.
 *
 * On a wiki whose pages do not link each other yet, `orphan-page` is true of every row,
 * and `shared-source-unlinked` of every pair. This module already refuses to let those
 * flip a page's `ok`; the surfaces refuse to draw them per row for the same reason, and
 * they reach a person through the Check-the-wiki report, which is where a judgement about
 * the whole wiki belongs.
 */
export function isAdvisoryWikiCode(code: string): boolean {
  return ADVISORY_CODES.has(code);
}

/** Page problems first, folder problems after; `ok` ignores the advisory folder codes. */
export function mergeWikiVerdict(
  page: WikiVerdictLike,
  folderProblems: ReadonlyArray<WikiProblemLike>,
): WikiVerdictLike {
  const own = page.problems.filter((problem) => !FOLDER_CODES.has(problem.code));
  const problems = [...own, ...folderProblems];
  const blocking = problems.filter((problem) => !ADVISORY_CODES.has(problem.code));
  return {
    ok: blocking.length === 0,
    firstProblem: problems[0]?.code ?? null,
    firstProblemMessage: problems[0]?.message ?? null,
    problemCount: problems.length,
    problems,
  };
}

/**
 * **Pages whose own shape misses the wiki contract**, counted once.
 *
 * The header strip, the index's wiki list and — since the graph became the Library's home
 * — the home strip's `off-template` clause all print this number. It was derived three
 * times from the same map, which is exactly the arrangement `libraryStepStates` exists to
 * prevent: three copies of one piece of arithmetic disagree the first time any of them is
 * edited, and they disagree in one viewport.
 *
 * A **folder** finding (a dangling link) is deliberately not counted here. It is not a
 * property of the page's shape, and the row marks it with a quiet word rather than the
 * amber pill (2026-09-07); {@link libraryDanglingLinkCount} is its own number.
 */
export function libraryOffTemplateCount(
  verdicts: ReadonlyMap<string, WikiVerdictLike>,
): number {
  let count = 0;
  for (const verdict of verdicts.values()) {
    if (verdict.problems.some((problem) => !isWikiFolderCode(problem.code))) count += 1;
  }
  return count;
}

/**
 * **Broken links, counted as links** — never as the pages holding them.
 *
 * A folder with six broken links across three pages says **6**: each finding is one line
 * in one page's reader panel, which is the unit a person repairs (2026-09-09). Advisory
 * findings are true of a young wiki rather than of a page and belong to the report.
 */
export function libraryDanglingLinkCount(
  verdicts: ReadonlyMap<string, WikiVerdictLike>,
): number {
  let count = 0;
  for (const verdict of verdicts.values()) {
    count += verdict.problems.filter(
      (problem) => isWikiFolderCode(problem.code) && !isAdvisoryWikiCode(problem.code),
    ).length;
  }
  return count;
}
