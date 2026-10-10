import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { buildWikiShapeFixBrief, isWikiFolderCode, type LibraryUiModel } from "@/features/library";
import { revealTauriVaultFile } from "@/shared/lib/tauri-vault-fs";
import { useToast } from "@/shared/ui";
import { useLibraryAgent } from "../../lib/use-library-agent";
import type { LibrarySelection } from "./library-page-state";
import type { useLibraryReader } from "./use-library-reader";
import type { useLibraryTurns } from "./use-library-turns";

export function useWikiTemplateProblems({
  t, locale, toast, nativeVaultRootPath, turnRunning, choose, busy, model, agent, reader, turns,
}: {
  t: ReturnType<typeof useTranslations<"library">>;
  locale: string;
  toast: ReturnType<typeof useToast>;
  nativeVaultRootPath: string | null;
  turnRunning: boolean;
  choose: (next: LibrarySelection) => void;
  busy: boolean;
  model: LibraryUiModel;
  agent: ReturnType<typeof useLibraryAgent>;
  reader: ReturnType<typeof useLibraryReader>;
  turns: ReturnType<typeof useLibraryTurns>;
}) {
  const { selectedWikiDoc, outlineHeadings, handleHeadingNavigate } = reader;
  const { writeMode, pendingFixRef } = turns;
  const wikiProblems = useMemo(
    () => (selectedWikiDoc ? (model.verdicts.get(selectedWikiDoc.slug)?.problems ?? []) : []),
    [model.verdicts, selectedWikiDoc],
  );
  const wikiPageTitle = useCallback(
    (slug: string) => model.wikiPages.find((page) => page.slug === slug)?.title,
    [model.wikiPages],
  );
  const wikiProblemDoors = useMemo(
    () => ({
      onOpenPage: (slug: string) => choose({ kind: "wiki", slug }),
      onOpenSource: (path: string) => choose({ kind: "source", path }),
      onOpenPlace: (where: { section?: string }) => {
        const heading = outlineHeadings.find((item) => item.text === where.section);
        if (heading) handleHeadingNavigate(heading.slug);
      },
    }),
    [choose, handleHeadingNavigate, outlineHeadings],
  );
  const wikiProblemFix = useMemo(() => {
    const shape = wikiProblems.filter((problem) => !isWikiFolderCode(problem.code));
    if (!selectedWikiDoc || shape.length === 0 || !nativeVaultRootPath) return null;
    if (agent.route === "agent") {
      return {
        mode: "agent" as const,
        disabled: busy || turnRunning,
        askEveryWrite: writeMode === "ask",
        onPress: () => {
          try {
            // A cancelled Fix leaves its finding in `pendingFixRef`; clearing it here keeps this
            // repair's completion from marking that finding fixed.
            pendingFixRef.current = null;
            agent.start(
              buildWikiShapeFixBrief({
                page: selectedWikiDoc.slug,
                findings: shape,
                locale,
                vaultRoot: nativeVaultRootPath,
              }),
              "fix",
            );
          } catch (error) {
            toast.show(
              t("wiki.compileFailed", { reason: error instanceof Error ? error.message : String(error) }),
              "error",
            );
          }
        },
      };
    }
    return {
      mode: "self" as const,
      onPress: () => {
        void revealTauriVaultFile(nativeVaultRootPath, `${selectedWikiDoc.slug}.md`).catch((error) => {
          toast.show(
            t("sources.revealFailed", {
              reason: error instanceof Error ? error.message : String(error),
            }),
            "error",
          );
        });
      },
    };
  }, [agent, busy, locale, nativeVaultRootPath, pendingFixRef, selectedWikiDoc, t, toast, turnRunning, wikiProblems, writeMode]);

  return { wikiProblems, wikiPageTitle, wikiProblemDoors, wikiProblemFix };
}
