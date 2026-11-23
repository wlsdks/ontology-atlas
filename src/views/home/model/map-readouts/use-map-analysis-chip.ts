import { useEffect, useMemo, useState } from "react";

import type { useLocalVault } from "@/entities/vault-session";
import { isMappingActive, useFolderMappingRun } from "@/features/work-run";
import { widestProjectLine } from "@/shared/lib/vault-document/mapping-share";
import { mapAnalysisChipModel, type MapAnalysisChipModel } from "../../lib/map-analysis/map-analysis-chip";

type LocalVault = Pick<ReturnType<typeof useLocalVault>, "status" | "manifest" | "mapAnalysisRecord">;

function nextLocalMidnightMs(nowMs: number): number {
  const next = new Date(nowMs);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

/**
 * The map analysis chip for the open folder: the project notes' widest line, the record the MCP
 * server keeps and whether a press is mapping now. Null on the sample or before the folder is read.
 * The clock moves when the running window ends and at local midnight, so "today" turns into
 * "yesterday" without a reload.
 */
export function useMapAnalysisChip(vault: LocalVault, folderPath: string | null): MapAnalysisChipModel | null {
  const mappingRun = useFolderMappingRun(folderPath ?? "");
  const pressRunning = mappingRun !== null && isMappingActive(mappingRun);
  const loaded = vault.status === "loaded" ? vault.manifest : null;
  const projects = useMemo(() => (loaded?.docs ?? []).filter((doc) => doc.frontmatter.kind === "project"), [loaded]);
  const record = vault.mapAnalysisRecord;
  const [clockMs, setNowMs] = useState(() => Date.now());
  // The clock only moves on the timer below, so a line that just arrived is read at its own time.
  const latestLine = record.kind === "read" ? record.analyses.at(-1) : undefined;
  const nowMs = Math.max(clockMs, latestLine ? Date.parse(latestLine.at) : clockMs);
  const model = useMemo(() => {
    if (!loaded) return null;
    const widest = widestProjectLine(projects.map((doc) => ({ project: doc.slug, figures: doc.notMappedAreas ?? null })));
    return mapAnalysisChipModel({ hasProject: projects.length > 0, noteFigures: widest?.figures ?? null, record, pressRunning, nowMs });
  }, [loaded, projects, record, pressRunning, nowMs]);
  const wakeAtMs = model ? Math.min(model.runningUntilMs ?? Number.POSITIVE_INFINITY, nextLocalMidnightMs(nowMs)) : null;
  useEffect(() => {
    if (wakeAtMs === null) return undefined;
    const timer = window.setTimeout(() => setNowMs(Date.now()), Math.max(0, wakeAtMs - Date.now()));
    return () => window.clearTimeout(timer);
  }, [wakeAtMs]);
  return model;
}
