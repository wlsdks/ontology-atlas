"use client";

/**
 * Reads Git history for the vault's summary nodes and reports which of them describe a
 * membership they no longer match.
 *
 * The judgement itself lives in `@/entities/docs-vault` and is shared, pinned to the MCP
 * server's copy by `tests/contract/summary-freshness-parity.contract.test.ts`. This hook
 * only supplies the history: it calls the `vault_node_revisions` Tauri command, which
 * does Git plumbing and no parsing.
 *
 * **App only, and silent elsewhere by design.** The browser cannot run Git, so a web
 * visitor gets an empty map and no row. That is honest degradation — the alternative
 * would be a screen that quietly implies every domain is current when it simply never
 * looked. Agents reach the same signal through `validate_vault.summaryFreshness` and the
 * `rejudge_summary_membership` maintenance action, which work in either setting.
 *
 * Cheap by construction: only `project` and `domain` nodes are asked for (8 of 83 in the
 * dogfood vault), the Rust side caps both the node count and the revisions per node, and
 * the result is recomputed only when the vault root or that slug list actually changes.
 *
 * **Why saving a file does not re-run this, and why that is right.** The verdict is
 * derived from *committed* history: an edit in the working tree changes no revision, so
 * re-reading on every save would spend Git processes to produce the identical answer.
 * The one case the key does not catch is a commit made while the app is open without the
 * membership changing — re-judging a domain's prose and snapshotting it leaves the row up
 * until the vault is reopened. That window is accepted rather than papered over: adding a
 * HEAD poll to erase it would cost more than the staleness it removes, and the row it
 * leaves standing is an invitation to re-read, never a block.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  SUMMARY_KINDS,
  summaryStalenessBySlug,
  type NodeRevision,
  type SummaryStaleness,
} from "@/entities/docs-vault";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";

/** The minimum a caller must know about a vault node for this hook to consider it. */
export interface SummaryCandidate {
  slug: string;
  kind: string;
}

async function invokeRevisions(vaultPath: string, slugs: string[]): Promise<NodeRevision[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<NodeRevision[]>("vault_node_revisions", { vaultPath, slugs });
}

/**
 * @param vaultRootPath Absolute vault path from `getTauriVaultRootPath`, or undefined in
 *   the browser and before a vault is chosen.
 * @param nodes Every vault node the caller knows about; this hook picks the summary kinds
 *   itself so callers never have to remember which those are.
 * @returns Verdicts keyed by slug. Empty whenever there is no Git to read, which callers
 *   must treat as "not checked" rather than "all current".
 */
export function useSummaryFreshness(
  vaultRootPath: string | undefined,
  nodes: readonly SummaryCandidate[],
): Map<string, SummaryStaleness> {
  // Keyed rather than bare: the answer is only valid for the vault and slug list it was
  // fetched for. Holding the key with the value lets a stale or not-yet-applicable result
  // be ignored on read, so the "no Git here" path needs no state write at all — which is
  // what `react-hooks/set-state-in-effect` is asking for.
  const [fetched, setFetched] = useState<{ key: string; verdicts: Map<string, SummaryStaleness> } | null>(
    null,
  );

  // A stable key, not the array: callers rebuild their node list on every render, and
  // depending on the identity would re-run Git on every paint.
  const summarySlugsKey = useMemo(() => {
    const slugs = nodes
      .filter((node) => (SUMMARY_KINDS as readonly string[]).includes(node.kind))
      .map((node) => node.slug)
      .sort();
    return slugs.join("\n");
  }, [nodes]);

  const requestKey = vaultRootPath && summarySlugsKey ? `${vaultRootPath}\u0000${summarySlugsKey}` : null;
  const requestRef = useRef<string | null>(null);

  useEffect(() => {
    if (!requestKey || !isTauriVaultRuntime()) return;
    requestRef.current = requestKey;
    let cancelled = false;

    invokeRevisions(vaultRootPath as string, summarySlugsKey.split("\n"))
      .then((revisions) => {
        // A vault switched mid-flight must not be described by the previous vault's
        // history, so a superseded response is dropped rather than rendered.
        if (cancelled || requestRef.current !== requestKey) return;
        setFetched({ key: requestKey, verdicts: summaryStalenessBySlug(revisions) });
      })
      .catch(() => {
        // No repository, no history, or the command is unavailable in this build. Record
        // an empty answer for this key rather than leaving the previous vault's verdicts
        // on screen; the caller renders no row either way.
        if (cancelled || requestRef.current !== requestKey) return;
        setFetched({ key: requestKey, verdicts: new Map() });
      });

    return () => {
      cancelled = true;
    };
  }, [requestKey, vaultRootPath, summarySlugsKey]);

  const empty = useMemo(() => new Map<string, SummaryStaleness>(), []);
  return fetched && requestKey && fetched.key === requestKey ? fetched.verdicts : empty;
}
