import type { LibraryUiModel } from "./use-library-model";

/**
 * **Where the folder stands, in the three words the shelf uses.**
 *
 * The derivation lived inside `LibraryStage` until 2026-09-06, which was fine while the
 * shelf was the only thing that said it. It is not any more: the Library's pane became
 * the graph, and the graph's header carries a one-line status strip — *Gather done ·
 * Compile next · 1 waiting* — so the same three states are now read in two places at
 * once, one of them permanently on screen and the other behind a chip.
 *
 * Two copies of this arithmetic would disagree the first time either one was edited, and
 * they would disagree **visibly**, in one viewport. So it is one function, and both
 * surfaces render what it returns.
 */

export type LibraryStepState = "done" | "next" | "waiting";

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
}

export function libraryStepStates(
  model: Pick<LibraryUiModel, "sources" | "wikiPages" | "needsCompileCount">,
): LibraryStepStates {
  const sourceCount = model.sources.length;
  const gather: LibraryStepState = sourceCount > 0 ? "done" : "next";
  const compile: LibraryStepState =
    model.needsCompileCount === 0 && model.wikiPages.length > 0
      ? "done"
      : sourceCount > 0
        ? "next"
        : "waiting";
  /*
   * `next` was unreachable here until 2026-09-06: both branches returned `waiting`, so a
   * folder whose pages were all written still showed the last step as one whose turn had
   * not come. Reading is done only when every source is covered; with pages on the shelf
   * and sources still waiting, reading is exactly what to do next.
   */
  const read: LibraryStepState =
    model.wikiPages.length === 0 ? "waiting" : model.needsCompileCount === 0 ? "done" : "next";
  return { gather, compile, read, leadIndex: [gather, compile, read].indexOf("next") };
}
