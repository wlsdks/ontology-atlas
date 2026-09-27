"use client";

import { useEffect, useMemo, useState } from "react";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { AcpWorkReceipt } from "@/shared/lib/acp-work-receipt";
import {
  createVaultFileProjectSourceStore,
  type ProjectSourceStore,
} from "@/shared/lib/project-source-store";

/**
 * Lifts "no code folder connected" out of a single node click into the INDEX beside the map. Never
 * mount a second `useProjectSourceModel` here: its folder walk would run regardless of selection
 * (`.claude/rules/architecture.md`). One sidecar read answers whether any project has zero bound
 * folders.
 */
export interface UnboundProjectSource {
  /** Clicking the row opens that node. */
  nodeId: string;
  /** The row picks singular or plural from it. */
  count: number;
}

type ProjectSourceReadinessState =
  | "loading"
  | "unbound"
  | "bound"
  | "unavailable"
  | "no-projects";

export interface ProjectSourceReadiness {
  state: ProjectSourceReadinessState;
  unbound: UnboundProjectSource | null;
}

const SOURCE_BINDING_TOOLS = new Set([
  "connect_project_source",
  "disconnect_project_source",
]);

/**
 * ACP binding writes only a sidecar, so its receipt belongs in this key, or the screen recommends a
 * done action.
 */
export function buildProjectSourceReadinessRefreshToken(input: {
  projectSlug: string | null;
  bindingCardinality: number | null;
  measuredAt: string | null;
  proposalSettled: boolean;
  acpWorkReceipts: readonly AcpWorkReceipt[];
}): string {
  let sourceBindingRevision = "";
  for (let index = input.acpWorkReceipts.length - 1; index >= 0; index -= 1) {
    const receipt = input.acpWorkReceipts[index];
    if (receipt.result !== "completed" || !SOURCE_BINDING_TOOLS.has(receipt.tool)) continue;
    sourceBindingRevision = `${receipt.id}:${receipt.result}:${receipt.updatedAt}`;
    break;
  }
  return [
    input.projectSlug ?? "",
    input.bindingCardinality ?? "",
    input.measuredAt ?? "",
    input.proposalSettled ? "settled" : "pending",
    sourceBindingRevision,
  ].join(":");
}

export function useProjectSourceReadiness(input: {
  vaultHandle: FileSystemDirectoryHandle | null;
  nodes: readonly KnowledgeGraphNode[];
  /** Test injection point; unset, it reads the vault sidecar. */
  createStore?: (handle: FileSystemDirectoryHandle) => ProjectSourceStore;
  /** A completed bind or measure invalidates the sidecar read. */
  refreshToken?: string | number | null;
}): ProjectSourceReadiness {
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
  // Keyed by what it was read from, so another vault's answer never shows after a switch.
  const [read, setRead] = useState<{
    handle: FileSystemDirectoryHandle;
    key: string;
    revision: string | number | null;
    value: ProjectSourceReadiness;
  } | null>(null);

  useEffect(() => {
    if (!input.vaultHandle || projects.length === 0) return;
    let cancelled = false;
    const handle = input.vaultHandle;
    const key = projectKey;
    const revision = input.refreshToken ?? null;
    const settle = (value: ProjectSourceReadiness) => {
      if (!cancelled) setRead({ handle, key, revision, value });
    };
    const store = (input.createStore ?? createVaultFileProjectSourceStore)(handle);
    void store.read().then((result) => {
      // Unreadable states pass silently: drawing them as "no folder" would make the row lie; the
      // panel reports them.
      if (result.status === "malformed" || result.status === "unavailable") {
        settle({ state: "unavailable", unbound: null });
        return;
      }
      const bound = new Set(result.bindings.map((binding) => binding.projectSlug));
      const missing = projects.filter((project) => !bound.has(project.slug));
      settle(missing.length > 0
        ? {
            state: "unbound",
            unbound: { nodeId: missing[0].nodeId, count: missing.length },
          }
        : { state: "bound", unbound: null });
    }, () => settle({ state: "unavailable", unbound: null }));
    return () => { cancelled = true; };
    // `projects` is a new array every render; the slug list decides what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.vaultHandle, input.createStore, input.refreshToken, projectKey]);

  if (!input.vaultHandle) return { state: "unavailable", unbound: null };
  if (projects.length === 0) return { state: "no-projects", unbound: null };
  return read
    && read.handle === input.vaultHandle
    && read.key === projectKey
    && read.revision === (input.refreshToken ?? null)
    ? read.value
    : { state: "loading", unbound: null };
}

/** Only the actionable missing-project summary. */
export function useUnboundProjectSource(input: {
  vaultHandle: FileSystemDirectoryHandle | null;
  nodes: readonly KnowledgeGraphNode[];
  createStore?: (handle: FileSystemDirectoryHandle) => ProjectSourceStore;
  refreshToken?: string | number | null;
}): UnboundProjectSource | null {
  return useProjectSourceReadiness(input).unbound;
}
