"use client";

import { useEffect, useMemo, useState } from "react";

import { createSummaryStalenessScan, SUMMARY_KINDS, type SummaryStaleness } from "@/entities/docs-vault";
import { gitNodeRevisionContent, gitNodeRevisions } from "@/shared/lib/tauri-git";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";

export interface SummaryCandidate {
  slug: string;
  kind: string;
}

export interface SummaryFreshnessResult {
  verdicts: Map<string, SummaryStaleness>;
  unavailable: Set<string>;
}

function emptyResult(): SummaryFreshnessResult {
  return { verdicts: new Map(), unavailable: new Set() };
}

const HISTORY_READ_BUDGET_MS = 30_000;

/** Sequential reads bound in-flight bodies; failed or superseded scans never publish partial clocks. */
export async function readSummaryFreshness(
  vaultPath: string,
  slugs: readonly string[],
  isCurrent: () => boolean,
): Promise<SummaryFreshnessResult | null> {
  const result = emptyResult();
  const deadline = performance.now() + HISTORY_READ_BUDGET_MS;
  for (const slug of slugs.slice(0, 64)) {
    if (!isCurrent()) return null;
    try {
      if (performance.now() >= deadline) throw new Error("git-history-timeout");
      const references = await gitNodeRevisions(vaultPath, slug);
      if (!isCurrent()) return null;
      if (!references || references.length < 2) continue;
      const scan = createSummaryStalenessScan(slug);
      for (const reference of references) {
        if (!isCurrent()) return null;
        if (performance.now() >= deadline) throw new Error("git-history-timeout");
        const content = await gitNodeRevisionContent(vaultPath, reference);
        if (!isCurrent()) return null;
        if (content !== null && scan.push({ slug, isoTime: reference.isoTime, content })) break;
      }
      const verdict = scan.finish();
      if (verdict) result.verdicts.set(slug, verdict);
    } catch (error) {
      if (!isCurrent()) return null;
      if (String(error).startsWith("git-repo-missing")) break;
      result.unavailable.add(slug);
    }
  }
  return result;
}

/** Committed-history verdicts refresh on folder/slug changes, not on uncommitted edits. */
export function useSummaryFreshness(
  vaultRootPath: string | undefined,
  nodes: readonly SummaryCandidate[],
): SummaryFreshnessResult {
  const [fetched, setFetched] = useState<{ key: string; result: SummaryFreshnessResult } | null>(null);
  const summarySlugsKey = useMemo(() => nodes
    .filter((node) => (SUMMARY_KINDS as readonly string[]).includes(node.kind))
    .map((node) => node.slug).sort().join("\n"), [nodes]);
  const requestKey = vaultRootPath && summarySlugsKey ? `${vaultRootPath}\u0000${summarySlugsKey}` : null;

  useEffect(() => {
    if (!requestKey || !vaultRootPath || !isTauriVaultRuntime()) return;
    let cancelled = false;
    void readSummaryFreshness(vaultRootPath, summarySlugsKey.split("\n"), () => !cancelled)
      .then((result) => {
        if (result && !cancelled) setFetched({ key: requestKey, result });
      });
    return () => { cancelled = true; };
  }, [requestKey, vaultRootPath, summarySlugsKey]);

  const empty = useMemo(() => emptyResult(), []);
  return fetched && fetched.key === requestKey ? fetched.result : empty;
}
