import { isWikiAdvisoryCode, isWikiFolderCode } from "@/shared/lib/wiki-report.mjs";

/** One finding; `message` stays the validator's English for the CLI and agents, `detail` is its localizable pieces. */
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
 * The folder and advisory code sets live in `mcp/src/wiki-report.mjs`, so the app and the CLI
 * split findings one way (docs/DECISIONS.md 2026-09-11). Advisory findings never flip `ok`.
 */
export { isWikiFolderCode };
/** Kept under its original name: every Library surface already imports this spelling. */
export const isAdvisoryWikiCode = isWikiAdvisoryCode;

/** Page problems first, folder problems after; `ok` ignores the advisory folder codes. */
export function mergeWikiVerdict(
  page: WikiVerdictLike,
  folderProblems: ReadonlyArray<WikiProblemLike>,
): WikiVerdictLike {
  const own = page.problems.filter((problem) => !isWikiFolderCode(problem.code));
  const problems = [...own, ...folderProblems];
  const blocking = problems.filter((problem) => !isAdvisoryWikiCode(problem.code));
  return {
    ok: blocking.length === 0,
    firstProblem: problems[0]?.code ?? null,
    firstProblemMessage: problems[0]?.message ?? null,
    problemCount: problems.length,
    problems,
  };
}

/** Pages whose own shape misses the contract, counted once for every surface; folder findings are not counted. */
export function libraryOffTemplateCount(
  verdicts: ReadonlyMap<string, WikiVerdictLike>,
): number {
  let count = 0;
  for (const verdict of verdicts.values()) {
    if (verdict.problems.some((problem) => !isWikiFolderCode(problem.code))) count += 1;
  }
  return count;
}

/** Broken links counted as links, the unit a person repairs, not as the pages holding them. */
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
