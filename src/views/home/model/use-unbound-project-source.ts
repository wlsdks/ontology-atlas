"use client";

import { useEffect, useMemo, useState } from "react";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  createVaultFileProjectSourceStore,
  type ProjectSourceStore,
} from "@/shared/lib/project-source-store";

/**
 * The minimum verdict needed to lift "no code folder connected" out of a
 * single node click and into the INDEX beside the map.
 *
 * Measured 2026-08-04: that sentence appeared 0 times on the first screen and
 * showed up only after clicking **exactly the one** project node (one of 15
 * fixture nodes, one of 100+ in the dogfood vault). An invisible diagnosis
 * never reaches anyone, however good the prescription.
 *
 * ⚠️ **Do not mount a second `useProjectSourceModel`.** That hook builds the
 * graph hash and the witness list, and in the installed app it also calls
 * `inspect`, which walks the whole folder — putting that in a place that runs
 * constantly, regardless of selection, is exactly the pattern where the most
 * frequent interaction pays for a screen nobody has opened
 * (`.claude/rules/architecture.md`). Only one fact is needed here: **does this
 * project have zero bound folders?** One sidecar read answers it.
 */
export interface UnboundProjectSource {
  /** Graph id of a project node with no bound folder — clicking opens that node. */
  nodeId: string;
  /** How many such projects there are; the row's wording picks singular or plural. */
  count: number;
}

export function useUnboundProjectSource(input: {
  vaultHandle: FileSystemDirectoryHandle | null;
  nodes: readonly KnowledgeGraphNode[];
  /** Injection point for tests. Unset, it reads the vault file sidecar. */
  createStore?: (handle: FileSystemDirectoryHandle) => ProjectSourceStore;
}): UnboundProjectSource | null {
  const projects = useMemo(
    () =>
      input.nodes
        .filter((node) => node.kind === "project")
        .map((node) => ({
          nodeId: node.id,
          slug: node.agentSlug || node.id.replace(/^project:/, ""),
        })),
    [input.nodes],
  );
  const projectKey = projects.map((p) => p.slug).join(" ");
  /*
   * The read value carries the `key` of **what it was read from**. That keeps
   * another vault's answer off screen for the frame right after switching
   * vaults, and removes the need to setState inside the effect just to clear a
   * "not read yet" state.
   */
  const [read, setRead] = useState<{
    key: string;
    value: UnboundProjectSource | null;
  } | null>(null);

  useEffect(() => {
    if (!input.vaultHandle || projects.length === 0) return;
    let cancelled = false;
    const key = projectKey;
    const settle = (value: UnboundProjectSource | null) => {
      if (!cancelled) setRead({ key, value });
    };
    const store = (input.createStore ?? createVaultFileProjectSourceStore)(input.vaultHandle);
    void store.read().then((result) => {
      /*
       * Unreadable states (`malformed`/`unavailable`) are **passed over
       * silently.** This is one quiet line beside the map, not the place to
       * diagnose a broken file — the panel says that in its own name when the
       * project is opened. Drawing a failed read as "no folder" would make this
       * row start lying.
       */
      if (result.status === "malformed" || result.status === "unavailable") {
        settle(null);
        return;
      }
      const bound = new Set(result.bindings.map((binding) => binding.projectSlug));
      const missing = projects.filter((project) => !bound.has(project.slug));
      settle(missing.length > 0 ? { nodeId: missing[0].nodeId, count: missing.length } : null);
    }, () => settle(null));
    return () => { cancelled = true; };
    // `projects` is a new array every render, so depending on it directly would
    // read the sidecar every render. The slug list decides what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.vaultHandle, input.createStore, projectKey]);

  if (!input.vaultHandle) return null;
  return read && read.key === projectKey ? read.value : null;
}
