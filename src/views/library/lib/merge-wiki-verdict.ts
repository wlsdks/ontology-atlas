export interface WikiVerdictLike {
  ok: boolean;
  firstProblem: string | null;
  firstProblemMessage: string | null;
  problemCount: number;
  problems: ReadonlyArray<{ code: string; message: string; line?: number }>;
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
  folderProblems: ReadonlyArray<{ code: string; message: string; line?: number }>,
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
