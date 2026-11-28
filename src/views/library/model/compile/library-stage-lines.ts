import type { useTranslations } from "use-intl";

import { countSourceFormats, newestWikiPage } from "@/entities/docs-vault";
import type { LibraryUiModel } from "@/features/library";
import type { LibraryLocalModel } from "../../lib/agent/use-library-agent";
import {
  libraryCompileBlockedReason,
  libraryTransferSentence,
  type CompileAvailability,
} from "../../lib/compile/compile-availability";
import { libraryCoverageCaption, libraryStepStates, libraryWaitingLine } from "../../lib/compile/stage-steps";

/**
 * Every sentence the three-step stage prints, and where each is printed. A reason is never printed
 * twice on this screen: the caption keeps it when it is already that sentence, and the paragraph
 * under the button appears only with something else to say.
 */
export function libraryStageLines({
  model, route, localModel, canCheck, lintBlockedReason, lintBlockedReasonId, answerSlugs, t,
}: {
  model: LibraryUiModel;
  route: CompileAvailability["route"];
  localModel: LibraryLocalModel | null;
  /** The report-only wiki check can run. */
  canCheck: boolean;
  lintBlockedReason: string | null;
  /** The element id of the paragraph another surface prints that reason in, or null when none does. */
  lintBlockedReasonId: string | null;
  /** The slugs step three lists as saved questions, so Start with does not advertise the same page twice. */
  answerSlugs: ReadonlySet<string> | undefined;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const formats = countSourceFormats(model.sources);
  const newest = newestWikiPage(
    answerSlugs && answerSlugs.size > 0
      ? model.wikiPages.filter((page) => !answerSlugs.has(page.slug))
      : model.wikiPages,
  );

  /** What leaves the computer, said once and where the press is; `null` on the agent route. */
  const transfer = libraryTransferSentence({ route, localModel }, t);
  const blocked = libraryCompileBlockedReason(
    { route, sourceCount: model.sources.length, needsCompileCount: model.needsCompileCount, localModel, sources: model.sources },
    t,
  );
  const steps = libraryStepStates(model);
  const { checkingCount } = steps;

  /** Step one's line: the formats the folder actually holds, in the index's own words. */
  const gatherCaption =
    formats.length === 0
      ? t("stage.none")
      : formats
          .map((entry) =>
            t("stage.formatEntry", {
              format: entry.format ? entry.format.toUpperCase() : t("sources.noFormat"),
              count: entry.count,
            }),
          )
          .join(" · ");

  /**
   * Step two's line is the index's own sentence, not a second phrasing of it. While the hashes are
   * still being taken, "nothing is waiting" is a guess rather than a fact, so it says it is checking.
   */
  const waitingLine = libraryWaitingLine(model, t);
  const compileCaption =
    waitingLine ??
    (checkingCount > 0
      ? t("stage.compile.checkingLine", { count: checkingCount })
      : t("stage.blockedNothingWaiting"));

  /**
   * The reason under the button, unless the caption above it is already that sentence. While the
   * hashes are being taken, "everything already matches" is not a reason, so it becomes the checking
   * sentence the caption carries and is printed once. The button stays disabled either way.
   */
  const blockedReason =
    blocked !== null && checkingCount > 0 && blocked === t("stage.blockedNothingWaiting")
      ? compileCaption
      : blocked;
  const blockedBelow = blockedReason && blockedReason !== compileCaption ? blockedReason : null;

  /** Why a partial read is worth a second run, once and without a number; the cure is the ordinary Compile press. */
  const partialNote = model.partialCount > 0 ? t("stage.compile.partialLine") : null;

  /**
   * Check the wiki's own reason: the sentence itself, never a second printing. This card prints it
   * only when no other surface owns it (no id given), so the button is not dead without a reason on
   * the `local` route, where Compile runs but agent-only turns cannot.
   */
  const lintBlocked = canCheck ? null : lintBlockedReason;
  const lintReasonBelow =
    lintBlocked && !lintBlockedReasonId && lintBlocked !== blockedBelow ? lintBlocked : null;
  const lintReasonId =
    lintBlockedReasonId ??
    (lintReasonBelow ? "library-stage-lint-blocked" : blockedBelow ? "library-stage-compile-blocked" : null);

  return {
    steps,
    newest,
    transfer,
    blocked,
    gatherCaption,
    compileCaption,
    blockedBelow,
    partialNote,
    lintBlocked,
    lintReasonBelow,
    lintReasonId,
    coverage: libraryCoverageCaption(model, checkingCount),
  };
}
