import { useCallback } from "react";
import type { useTranslations } from "next-intl";

import type { LibrarySourceRow } from "@/entities/docs-vault";
import { buildCompileBrief, type LibraryUiModel } from "@/features/library";
import type { useToast } from "@/shared/ui";

import type { useLibraryAgent } from "../../lib/agent/use-library-agent";
import { compileWriterId } from "../turns/writer-id";

/**
 * Builds the compile brief for a batch and starts it. Returns false after saying why, when the brief
 * could not be built or started, so the batch is not left marked as running.
 */
export function useCompileSender({ agent, model, locale, nativeVaultRootPath, t, toast }: {
  agent: ReturnType<typeof useLibraryAgent>;
  model: LibraryUiModel;
  locale: string;
  nativeVaultRootPath: string | null;
  t: ReturnType<typeof useTranslations<"library">>;
  toast: ReturnType<typeof useToast>;
}) {
  return useCallback((batch: readonly LibrarySourceRow[]): boolean => {
    try {
      agent.start(
        buildCompileBrief({
          sources: batch,
          existingPages: model.wikiPages,
          hashes: model.hashes,
          locale,
          execution: agent.route === 'local' ? 'local' : 'acp',
          writerId: compileWriterId(agent.route, agent.localModel, agent.runtime),
          vaultRoot: nativeVaultRootPath ?? "",
          now: new Date(),
        }),
        'compile',
        batch.map((row) => row.path),
      );
      return true;
    } catch (error) {
      toast.show(
        t("wiki.compileFailed", {
          reason: error instanceof Error ? error.message : String(error),
        }),
        "error",
      );
      return false;
    }
  }, [agent, locale, model.hashes, model.wikiPages, nativeVaultRootPath, t, toast]);
}
