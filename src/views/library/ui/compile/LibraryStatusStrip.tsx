import type { RefObject } from "react";
import type { useTranslations } from "use-intl";

import { controlClass } from "@/shared/ui/control-class";

import { libraryDanglingLinkCount, libraryOffTemplateCount, selectCompileTargets } from "@/features/library";
import { libraryStepStates } from "../../lib/compile/stage-steps";
import type { LibraryUiModel } from "@/features/library";

/**
 * One status, or nothing: the strip says which step is next and then only counts true of this
 * folder, and renders nothing when there is nothing to report. Every word comes from
 * `libraryStepStates`, so the header and the stepper cannot disagree.
 */
export function LibraryStatusStrip({
  model,
  indexShowsSourceStates = false,
  onCompileNext,
  compileAnchorRef,
  compileOpen,
  t,
}: {
  model: LibraryUiModel;
  /**
   * The index beside this strip is the Sources list, whose head already counts the not-compiled rows,
   * so the strip leaves that clause out.
   */
  indexShowsSourceStates?: boolean;
  /** Opens the Compile popover, the home clause's own press; absent, the clause is text. */
  onCompileNext?: () => void;
  /** Where that popover hangs while this strip, not the home's, is on screen. */
  compileAnchorRef?: RefObject<HTMLButtonElement | null>;
  compileOpen?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const states = libraryStepStates(model);
  const titles = [t("stage.gather.title"), t("stage.compile.title"), t("stage.read.title")];
  const parts: string[] = [];
  /*
   * Both strips read the file `selectCompileTargets` would start on, which is what the press itself
   * runs.
   */
  const compileTarget = states.leadIndex === 1 ? (selectCompileTargets(model.sources)[0] ?? null) : null;
  if (compileTarget) {
    parts.push(t("home.compileNext", { source: compileTarget.path.replace(/^sources\//, "") }));
  } else if (states.leadIndex >= 0) {
    parts.push(
      t("stage.status", {
        step: titles[states.leadIndex] as string,
        state: t("stage.state.next"),
      }),
    );
  } else if (states.checkingCount > 0) {
    /*
     * Nothing is next and nothing is finished either: hashing is lazy, so listed but unmeasured sources
     * leave `needsCompileCount === 0` without anything being known written up. Say `checking`, not that
     * every source is written up.
     */
    parts.push(t("stage.statusChecking", { count: states.checkingCount }));
  } else if (states.unreadableCount > 0) {
    // A file that could not be opened is not covered, so the sequence is not finished either.
    parts.push(t("stage.statusUnreadable", { count: states.unreadableCount }));
  } else if (model.wikiPages.length > 0) {
    // No step is next, nothing is being measured and pages exist, so the sequence is finished.
    parts.push(t("stage.statusReady"));
  }
  /*
   * The same two numbers the home prints, in the same words. `needsCompileCount` also counts compiled
   * sources whose citing pages need review; that remainder keeps the waiting word so the arithmetic
   * closes.
   */
  /*
   * One not-compiled file that the lead clause already names is said once; at two or more the count
   * adds what the name cannot.
   */
  const leadNamesTheOnlyOne =
    compileTarget !== null && model.notCompiledCount === 1 && compileTarget.state === "not-compiled";
  if (model.notCompiledCount > 0 && !indexShowsSourceStates && !leadNamesTheOnlyOne) {
    parts.push(t("stage.statusNotCompiled", { count: model.notCompiledCount }));
  }
  if (model.staleCount > 0) parts.push(t("home.staleClause", { count: model.staleCount }));
  if (model.partialCount > 0) {
    parts.push(t("stage.statusPartial", { count: model.partialCount }));
  }
  const reviewOnly =
    model.needsCompileCount - model.notCompiledCount - model.staleCount - model.partialCount;
  if (reviewOnly > 0) parts.push(t("stage.statusWaiting", { count: reviewOnly }));
  /*
   * The header counts what the rows draw. The arithmetic is shared with the home
   * (`libraryOffTemplateCount`, `libraryDanglingLinkCount`): a page is the unit for off-template, a
   * link for broken links, and advisory findings are counted by neither.
   */
  const offTemplate = libraryOffTemplateCount(model.verdicts);
  const unlinked = libraryDanglingLinkCount(model.verdicts);
  if (offTemplate > 0) parts.push(t("stage.statusOffTemplate", { count: offTemplate }));
  if (unlinked > 0) parts.push(t("stage.statusUnlinked", { count: unlinked }));
  if (parts.length === 0) return null;

  /*
   * The next file is a press here too: with `onCompileNext` the clause is the home's accent link with
   * the home's popover behind it.
   */
  if (compileTarget && onCompileNext) {
    const rest = parts.slice(1);
    return (
      <p
        data-testid="library-status-strip"
        className="flex min-w-0 items-center gap-x-1.5 text-label leading-body text-[color:var(--color-text-secondary)]"
      >
        <button
          type="button"
          ref={compileAnchorRef}
          onClick={onCompileNext}
          data-testid="library-status-compile"
          aria-expanded={compileOpen}
          className={controlClass({
            shape: "link",
            tone: "accent",
            hoverInk: "strong",
            active: compileOpen === true,
            className: "min-w-0 max-w-full",
          })}
        >
          <span className="min-w-0 truncate">{parts[0]}</span>
        </button>
        {rest.length > 0 ? (
          <>
            <span aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]">
              ·
            </span>
            <span className="min-w-0 truncate">{rest.join(" · ")}</span>
          </>
        ) : null}
      </p>
    );
  }

  return (
    <p
      data-testid="library-status-strip"
      className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-secondary)]"
    >
      {parts.join(" · ")}
    </p>
  );
}
