import { useTranslations } from "next-intl";
import {
  selectCompileTargets,
  type LibraryUiModel,
  type RetainedAnswerHead,
} from "@/features/library";
import type { LibraryHomeStripDoor } from "../../ui/home/LibraryHomeStrip";
import type { Dispatch, SetStateAction } from "react";
import type { LibrarySelection, LibraryHomeSurface } from "../library-selection";

/**
 * The Library-wide doors in the page header, and what the More door lists below `lg`: How to use,
 * Questions (Open saved answer when exactly one is kept), Conversation, and the updated answer's
 * review while one waits.
 */
export function libraryHomeStrip({
  t, homeSurface, setHomeSurface, choose, model, retainedAnswers, onOpenConversation, onReview,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  homeSurface: LibraryHomeSurface;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  choose: (next: LibrarySelection) => void;
  model: LibraryUiModel;
  retainedAnswers: readonly RetainedAnswerHead[];
  /** Null where no agent can hold a conversation in this folder. */
  onOpenConversation: (() => void) | null;
  /** Null while no updated answer waits for review. */
  onReview: (() => void) | null;
}) {
  const compileTarget = selectCompileTargets(model.sources)[0] ?? null;
  const soleAnswer = retainedAnswers.length === 1 ? retainedAnswers[0] ?? null : null;
  const homeDoors: LibraryHomeStripDoor[] = [
    {
      id: "guide",
      label: t("home.guide"),
      onPress: () => setHomeSurface((current) => (current === "guide" ? null : "guide")),
      testId: "library-guide-open",
      open: homeSurface === "guide",
    },
    {
      id: "questions",
      label: soleAnswer ? t("home.openAnswer") : t("home.questions", { count: retainedAnswers.length }),
      tooltip: soleAnswer?.title,
      onPress: soleAnswer
        ? () => choose({ kind: "wiki", slug: soleAnswer.slug })
        : () => setHomeSurface((current) => (current === "questions" ? null : "questions")),
      testId: "library-questions-open",
      open: soleAnswer ? undefined : homeSurface === "questions",
    },
  ];
  const overflowDoors: LibraryHomeStripDoor[] = [
    ...(onReview ? [{ id: "review" as const, label: t("answers.reviewDraft"), onPress: onReview, testId: "answer-review-open" }] : []),
    ...homeDoors,
    ...(onOpenConversation
      ? [{ id: "conversation" as const, label: t("conversation.open"), onPress: onOpenConversation, testId: "library-open-conversation" }]
      : []),
  ];

  return { compileTarget, soleAnswer, homeDoors, overflowDoors };
}
