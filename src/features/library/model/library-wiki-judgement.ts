import type { WikiNodeIndex } from "@/shared/lib/library/wiki-page-schema";
import { wikiFolderJudgement, wikiPageProblems, type WikiPageFacts } from "@/shared/lib/library/wiki-folder";
import { aggregateWikiFindings, type WikiReport } from "@/shared/lib/library/wiki-report.mjs";
import { mergeWikiVerdict, type WikiProblemLike } from "./merge-wiki-verdict";

export interface LibraryWikiVerdict {
  ok: boolean;
  /** The first problem's code, which is what a one-line row has room to say. */
  firstProblem: string | null;
  /** Its sentence, so the reader can show a reason without asking for a hover. */
  firstProblemMessage: string | null;
  problemCount: number;
  /** Every problem, for the block drawn beside the page itself. */
  problems: ReadonlyArray<WikiProblemLike>;
}

interface JudgeContext {
  knownSources: ReadonlySet<string>;
  nodes: WikiNodeIndex;
}

/** A page's own problems for one folder context, so a batch of new pages re-judges only the folder half of the rest. */
const ownProblems = new WeakMap<WikiPageFacts, { context: JudgeContext; problems: WikiProblemLike[] }>();

function pageProblems(facts: WikiPageFacts, context: JudgeContext): WikiProblemLike[] {
  const kept = ownProblems.get(facts);
  if (kept && kept.context.knownSources === context.knownSources && kept.context.nodes === context.nodes) return kept.problems;
  const problems = wikiPageProblems(facts, context);
  ownProblems.set(facts, { context, problems });
  return problems;
}

/**
 * The read pages judged as `wiki-validate` judges them, the folder half among the read pages only.
 * O(P + Σ links + Σ sources); a page's own half is reused while its facts and the context hold.
 */
export function judgeLibraryWiki(
  pages: ReadonlyArray<{ slug: string; facts: WikiPageFacts }>,
  context: JudgeContext,
): Map<string, LibraryWikiVerdict> {
  const folder = wikiFolderJudgement(pages.map(({ slug, facts }) => ({ path: `${slug}.md`, facts })));
  const verdicts = new Map<string, LibraryWikiVerdict>();
  pages.forEach(({ slug, facts }, index) => {
    const problems = pageProblems(facts, context);
    verdicts.set(slug, mergeWikiVerdict({
      ok: problems.length === 0,
      firstProblem: problems[0]?.code ?? null,
      firstProblemMessage: problems[0]?.message ?? null,
      problemCount: problems.length,
      problems,
    }, folder.problemsOf(index)));
  });
  return verdicts;
}

export function libraryWikiReport(verdicts: ReadonlyMap<string, LibraryWikiVerdict>, unmeasured: readonly string[]): WikiReport {
  return aggregateWikiFindings({
    pages: [...verdicts].map(([slug, verdict]) => ({ path: `${slug}.md`, problems: verdict.problems })),
    unmeasured: unmeasured.map((slug) => `${slug}.md`),
  });
}
