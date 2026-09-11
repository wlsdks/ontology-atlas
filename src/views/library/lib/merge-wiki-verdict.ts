import { isWikiAdvisoryCode, isWikiFolderCode } from "@/shared/lib/wiki-report.mjs";

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
 * ⚠️ **The two code sets moved.** They live in `mcp/src/wiki-report.mjs` and reach here
 * through `@/shared/lib/wiki-report.mjs`, because three surfaces were deciding the same
 * split separately and two of them decided it in opposite directions: this module kept
 * `orphan-page` and `shared-source-unlinked` out of a page's `ok`, while
 * `wiki-validate` counted them as off-template, so the app's footer said "2 pages do not
 * fit the template" on the same folder a terminal called `0/6 pages fit` — both numbers
 * correctly computed from different rules. `docs/DECISIONS.md` 2026-09-11 makes exactly
 * that a falsifier, so the rule is now one field on one aggregator and this module reads
 * it rather than restating it.
 *
 * The predicates keep their names and their meaning. A folder finding — a link that goes
 * nowhere, a page nothing points at, a source two pages share without linking — describes
 * the wiki's shape rather than one page's own bytes, and the row draws it as a quiet word
 * instead of the amber pill a malformed page wears. An *advisory* folder finding is true
 * of a young wiki rather than of a page: on a folder nobody has cross-linked,
 * `orphan-page` is true of every page, and a pill on every row says nothing (library
 * e2e, 2026-09-07). Advisory findings never flip a page's `ok`; they are reported,
 * counted, and ordered last in the Check-results report, which is where a judgement about
 * the whole wiki belongs.
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
