import { useTranslations } from "next-intl";
import {
  selectCompileTargets,
  libraryOffTemplateCount,
  type LibraryUiModel,
  type RetainedAnswerHead,
} from "@/features/library";
import type { LibraryHomeStripClause, LibraryHomeStripDoor } from "../parts/LibraryHomeStrip";
import type { Dispatch, SetStateAction } from "react";
import type { LibrarySelection, LibraryHomeSurface } from "./library-page-state";
import type { useLibraryHome } from "./use-library-home";

export function libraryHomeStrip({
  t, homeSurface, setHomeSurface, setStaleLit, staleLit, choose, model, retainedAnswers, home,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  homeSurface: LibraryHomeSurface;
  setHomeSurface: Dispatch<SetStateAction<LibraryHomeSurface>>;
  setStaleLit: Dispatch<SetStateAction<boolean>>;
  staleLit: boolean;
  choose: (next: LibrarySelection) => void;
  model: LibraryUiModel;
  retainedAnswers: readonly RetainedAnswerHead[];
  home: ReturnType<typeof useLibraryHome>;
}) {
  const { openReport } = home;
  const compileTarget = selectCompileTargets(model.sources)[0] ?? null;
  const offTemplateCount = libraryOffTemplateCount(model.verdicts);
  const homeClauses: LibraryHomeStripClause[] = [];
  if (compileTarget) {
    homeClauses.push({
      kind: "compile",
      text: t("home.compileNext", { source: compileTarget.path.replace(/^sources\//, "") }),
      onPress: () => {
        setStaleLit(false);
        setHomeSurface((current) => (current === "compile" ? null : "compile"));
      },
      testId: "library-strip-compile",
      open: homeSurface === "compile",
    });
  }
  if (model.staleCount > 0) {
    homeClauses.push({
      kind: "stale",
      text: t("home.staleClause", { count: model.staleCount }),
      onPress: () => {
        setHomeSurface(null);
        setStaleLit((lit) => !lit);
      },
      pressed: staleLit,
      testId: "library-strip-stale",
    });
  }
  if (offTemplateCount > 0) {
    homeClauses.push({
      kind: "offTemplate",
      text: t("stage.statusOffTemplate", { count: offTemplateCount }),
      onPress: openReport,
      testId: "library-strip-offtemplate",
    });
  }

  const soleAnswer = retainedAnswers.length === 1 ? retainedAnswers[0] ?? null : null;
  const homeDoors: LibraryHomeStripDoor[] = [
    {
      id: "guide",
      label: t("home.guide"),
      onPress: () => {
        setStaleLit(false);
        setHomeSurface((current) => (current === "guide" ? null : "guide"));
      },
      testId: "library-guide-open",
      open: homeSurface === "guide",
    },
    {
      id: "questions",
      label: soleAnswer ? soleAnswer.title : t("home.questions", { count: retainedAnswers.length }),
      onPress: soleAnswer
        ? () => {
            setStaleLit(false);
            choose({ kind: "wiki", slug: soleAnswer.slug });
          }
        : () => {
            setStaleLit(false);
            setHomeSurface((current) => (current === "questions" ? null : "questions"));
          },
      testId: "library-questions-open",
      open: soleAnswer ? undefined : homeSurface === "questions",
    },
  ];

  return { compileTarget, offTemplateCount, homeClauses, soleAnswer, homeDoors };
}
