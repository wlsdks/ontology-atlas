import { useMemo } from "react";
import type { useTranslations } from "use-intl";

import type { VaultDoc } from "@/entities/docs-vault";
import { dropCandidatesWithNodes, type LibraryUiModel } from "@/features/library";
import { latestReport, useFolderWorkRun } from "@/features/work-run";

import { wikiCheckPayload } from "../turns/wiki-check-outcome";
import { reportOutline } from "./check-report-outline";
import { reportDoorCount } from "./report-door-count";

const NO_FIXED_KEYS: ReadonlySet<string> = new Set();

/** What the folder's last wiki check left to show: its findings and names, the rail's heads, the door's count. */
export function useWikiCheckReport({ workVaultScope, docs, model, t }: {
  workVaultScope: string;
  docs: VaultDoc[];
  model: LibraryUiModel;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const checkRun = useFolderWorkRun(workVaultScope);
  const { candidates, findings } = wikiCheckPayload(checkRun);
  const fixedKeys = latestReport(checkRun)?.handled ?? NO_FIXED_KEYS;
  const openCandidates = useMemo(() => dropCandidatesWithNodes(candidates, docs), [candidates, docs]);
  const reportHeadings = useMemo(
    () => reportOutline(model.structural, findings, openCandidates.length, t),
    [findings, model.structural, openCandidates.length, t],
  );
  const doorCount = useMemo(
    () => reportDoorCount({
      structuralFindings: model.structural.findingCount,
      agentFindings: findings.length,
      agentNames: openCandidates.length,
      wikiPageCount: model.wikiPages.length,
      hasRecordedCheck: !!model.log.lastLint,
    }),
    [findings.length, model.log.lastLint, model.structural.findingCount, model.wikiPages.length, openCandidates.length],
  );
  return { checkRun, candidates, findings, fixedKeys, openCandidates, reportHeadings, reportDoorCount: doorCount };
}
