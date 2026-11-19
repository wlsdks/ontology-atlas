import type { useTranslations } from "next-intl";

import type { LibraryUiModel } from "@/features/library";

/**
 * Where the folder stands in the three words the shelf uses; one function so the shelf and the graph
 * header status strip render the same states.
 */

/**
 * `checking`: hashing is lazy, so a listed but unmeasured source is neither written up nor waiting.
 * Not `waiting`: nothing is wrong and there is nothing to press. `unreadable`: a cited file could not be
 * opened to check, so the step cannot be called done, and pressing Compile would not change that.
 */
export type LibraryStepState = "done" | "next" | "waiting" | "checking" | "unreadable";

export interface LibraryStepStates {
  gather: LibraryStepState;
  compile: LibraryStepState;
  read: LibraryStepState;
  /**
   * Index of the earliest step that is `next`, or `-1` when none is.
   *
   * Two steps can honestly be next at once — a folder with pages already written and
   * sources still waiting can be compiled or read — but two emphases are no emphasis at
   * all. Every badge stays true; only the one visual lead moves.
   */
  leadIndex: number;
  /** Sources listed but not yet measured — the count the `checking` word stands for. */
  checkingCount: number;
  /** Cited sources that could not be opened to hash; never done, never counted. */
  unreadableCount: number;
}

/**
 * **What is still waiting, in the clauses a person acts on.**
 *
 * Three unfinished states, and they are not one number: a source nobody wrote up, a page
 * that has fallen behind its bytes, and a page written from the first part of a long file
 * are three different pieces of work. `needsCompileCount` adds them together for the
 * button; this is the same arithmetic as words, and it is one function because the index's
 * footnote and step two's caption both print it — two copies would disagree the first time
 * either was edited, and they would disagree in one viewport.
 *
 * Returns null when nothing is waiting, which is the caller's cue to say something else
 * rather than to print a zero.
 */
export function libraryWaitingLine(
  model: Pick<LibraryUiModel, "notCompiledCount" | "staleCount" | "partialCount"> & Partial<Pick<LibraryUiModel, "sources">>,
  t: ReturnType<typeof useTranslations<"library">>,
): string | null {
  const clauses: string[] = [];
  if (model.notCompiledCount > 0 && model.staleCount > 0) {
    clauses.push(
      t("sources.needsCompileSplit", {
        notCompiled: model.notCompiledCount,
        stale: model.staleCount,
      }),
    );
  } else if (model.staleCount > 0) {
    clauses.push(t("sources.staleOnly", { count: model.staleCount }));
  } else if (model.notCompiledCount > 0) {
    clauses.push(t("sources.needsCompile", { count: model.notCompiledCount }));
  }
  /*
   * Last, and never folded into the two above. A page that read part of a long file is
   * the least urgent of the three — it is right about what it covers — so it is named
   * after the work that is actually missing rather than counted alongside it.
   */
  if (model.partialCount > 0) {
    clauses.push(t("sources.partialOnly", { count: model.partialCount }));
  }
  const reviewCount = new Set((model.sources ?? []).flatMap((source) => source.reviewPages ?? [])).size;
  if (reviewCount > 0) {
    clauses.push(t("sources.pagesNeedReview", { count: reviewCount }));
  }
  return clauses.length === 0 ? null : clauses.join(" · ");
}

export function libraryStepStates(
  model: Pick<LibraryUiModel, "sources" | "wikiPages" | "needsCompileCount">,
): LibraryStepStates {
  const sourceCount = model.sources.length;
  /**
   * Sources listed but not yet hashed; the rows and the steps that would otherwise claim a result say
   * `checking`.
   */
  const checkingCount = model.sources.filter((row) => row.state === "checking").length;
  const unreadableCount = model.sources.filter((row) => row.state === "unreadable").length;
  const gather: LibraryStepState = sourceCount > 0 ? "done" : "next";
  const compile: LibraryStepState =
    model.needsCompileCount > 0 && sourceCount > 0
      ? "next"
      : sourceCount === 0
        ? "waiting"
        : checkingCount > 0
          ? "checking"
          : unreadableCount > 0
            ? "unreadable"
            : model.wikiPages.length > 0
              ? "done"
              : "next";
  /*
   * Reading is done only when every source is covered; with pages on the shelf and sources still
   * waiting, reading is what to do next.
   */
  const read: LibraryStepState =
    model.wikiPages.length === 0
      ? "waiting"
      : model.needsCompileCount > 0
        ? "next"
        : checkingCount > 0
          ? "checking"
          : unreadableCount > 0
            ? "unreadable"
            : "done";
  return {
    gather,
    compile,
    read,
    leadIndex: [gather, compile, read].indexOf("next"),
    checkingCount,
    unreadableCount,
  };
}


/**
 * Which coverage sentence the read step prints. `checking`, `partial` and `stale` sources have a
 * page or are about to but are not `compiled`, so the plain count would mislead. The chain names one
 * clause, most specific first.
 */
export function libraryCoverageCaption(
  model: Pick<LibraryUiModel, "sources" | "partialCount" | "staleCount">,
  checkingCount: number,
): {
  key: "coveredChecking" | "coveredUnreadable" | "coveredPartial" | "coveredStale" | "coveredLine";
  values: Record<string, number>;
} {
  const total = model.sources.length;
  const compiled = model.sources.filter((row) => row.state === "compiled").length;
  if (checkingCount > 0) {
    return { key: "coveredChecking", values: { compiled, total, checking: checkingCount } };
  }
  const unreadable = model.sources.filter((row) => row.state === "unreadable").length;
  if (unreadable > 0) {
    return { key: "coveredUnreadable", values: { compiled, total, unreadable } };
  }
  if (model.partialCount > 0) {
    return { key: "coveredPartial", values: { compiled, total, partial: model.partialCount } };
  }
  if (model.staleCount > 0) {
    return { key: "coveredStale", values: { compiled, total, stale: model.staleCount } };
  }
  return { key: "coveredLine", values: { compiled, total } };
}
