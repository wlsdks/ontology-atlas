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
