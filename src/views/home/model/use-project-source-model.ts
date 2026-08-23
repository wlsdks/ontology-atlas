"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VaultDoc } from "@/entities/docs-vault";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildProjectGraphHash,
  buildProjectSourceReceipt,
  deriveProjectSourceView,
  PROJECT_SOURCE_RECEIPT_VERSION,
  type ProjectSourceBinding,
  type ProjectSourceProbe,
  type ProjectSourceView,
  type ProjectSourceWitnessInput,
} from "@/shared/lib/project-source-receipt";
import { proposeProjectSourceFromInspection } from "@/shared/lib/project-source-proposal";
import {
  createVaultFileProjectSourceStore,
  type ProjectSourceStore,
  type ProjectSourceStoreReadResult,
} from "@/shared/lib/project-source-store";
import {
  getTauriVaultRootPath,
  inspectTauriProjectSource,
  isTauriVaultRuntime,
  pickTauriVaultDirectory,
  type ProjectSourceInspection,
} from "@/shared/lib/tauri-vault-fs";
import { deriveProjectSourceWitnesses } from "../lib/project-source-witnesses";

export type ProjectSourceModelError =
  | "sidecar_malformed"
  | "sidecar_unavailable"
  | "picker_failed"
  | "measurement_failed"
  | "invalid_measurement"
  | "persistence_failed";

export interface ProjectSourceRuntime {
  available(): boolean;
  /**
   * `title` is **the OS folder picker's window title**, so pass it in the
   * screen's language. Measured in the installed app 2026-08-04: on a Korean
   * screen only that window's title stayed English (`Connect project code
   * folder`) — the one place where the app suddenly speaks in someone else's
   * voice.
   */
  pickRoot(title?: string): Promise<string | null>;
  inspect(rootPath: string): Promise<ProjectSourceInspection | null>;
  /**
   * The vault folder's **absolute path**. It is the only input the inference
   * has, so on a surface without it (the web) there is no inference at all — a
   * browser does not know where on disk the chosen folder lives.
   */
  rootPathOf(handle: FileSystemDirectoryHandle): string | null;
  now(): string;
  restoreFocus(element: HTMLElement): void;
}

/**
 * The data behind "is this the right folder?". Only a proposal the screen has
 * earned the right to draw lands here: with `low` confidence or no candidate
 * it is `null`, and the screen falls back to the plain folder picker. This is
 * where the "no greyed-out buttons" contract is kept.
 */
export interface ProjectSourceProposedRoot {
  rootPath: string;
  /** The only evidence the app can offer today — the git repository enclosing the vault. */
  marker: "enclosing_git_repository";
  confidence: "high" | "medium";
  /** Produced by **actually measuring** the candidate. With no declared paths it is null: no ratio is claimed. */
  witnessSummary: { total: number; supported: number; missing: number } | null;
}

const defaultRuntime: ProjectSourceRuntime = {
  available: isTauriVaultRuntime,
  pickRoot: async (title) => {
    const handle = await pickTauriVaultDirectory(title ?? "Connect project code folder");
    if (!handle) return null;
    const rootPath = getTauriVaultRootPath(handle);
    if (!rootPath) throw new Error("Native folder picker did not return a local root.");
    return rootPath;
  },
  inspect: inspectTauriProjectSource,
  rootPathOf: (handle) => getTauriVaultRootPath(handle) ?? null,
  now: () => new Date().toISOString(),
  restoreFocus: (element) => {
    window.requestAnimationFrame(() => {
      if (element.isConnected) element.focus({ preventScroll: true });
    });
  },
};

function probeFromInspection(inspection: ProjectSourceInspection): ProjectSourceProbe {
  return {
    sourceId: inspection.sourceId,
    kind: inspection.kind,
    revision: inspection.revision,
    fingerprint: inspection.fingerprint,
    dirty: inspection.dirty,
    truncated: inspection.truncated,
    files: inspection.files,
  };
}

function invalidReadView(projectSlug: string): ProjectSourceView {
  return {
    contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
    projectSlug,
    status: "invalid",
    currentness: "unavailable",
    measuredAt: null,
    topGap: { id: "receipt_malformed" },
    nextAction: { id: "repair_source_binding" },
    bindingCardinality: 0,
    receipt: null,
  };
}

export interface ProjectSourceSnapshot {
  view: ProjectSourceView;
  bindings: ProjectSourceBinding[];
  readStatus: ProjectSourceStoreReadResult["status"];
}

export async function loadProjectSourceSnapshot(input: {
  store: ProjectSourceStore;
  projectSlug: string;
  graphHash: string;
  inspect?: (rootPath: string) => Promise<ProjectSourceInspection | null>;
}): Promise<ProjectSourceSnapshot> {
  const result = await input.store.list(input.projectSlug);
  if (result.status === "malformed" || result.status === "unavailable") {
    return { view: invalidReadView(input.projectSlug), bindings: [], readStatus: result.status };
  }
  const bindings = result.status === "ok" ? result.bindings : [];
  let probe: ProjectSourceProbe | null = null;
  if (bindings.length === 1 && input.inspect) {
    try {
      const inspection = await input.inspect(bindings[0].rootPath);
      probe = inspection ? probeFromInspection(inspection) : null;
    } catch {
      // Passive refresh must not erase a valid receipt. Currentness becomes
      // unavailable until an explicit remeasure can explain the failure.
    }
  }
  return {
    view: deriveProjectSourceView({
      projectSlug: input.projectSlug,
      bindings,
      graphHash: input.graphHash,
      probe,
    }),
    bindings,
    readStatus: result.status,
  };
}

function sourceActionUsesPicker(view: ProjectSourceView): boolean {
  return view.nextAction.id === "connect_source" || view.nextAction.id === "repair_source_binding";
}

function sourceActionRemeasures(view: ProjectSourceView): boolean {
  return view.nextAction.id === "measure_source" || view.nextAction.id === "remeasure_source";
}

export function projectSlugForSource(
  node: Pick<KnowledgeGraphNode, "id" | "kind" | "agentSlug"> | null,
): string | null {
  if (!node || node.kind !== "project") return null;
  return node.agentSlug || node.id.replace(/^project:/, "");
}

export function useProjectSourceModel(input: {
  projectSlug: string | null;
  vaultHandle: FileSystemDirectoryHandle | null;
  nodes: readonly KnowledgeGraphNode[];
  docs: readonly VaultDoc[];
  /** OS folder picker title — the caller passes it in the screen's language. */
  pickerTitle?: string;
  runtime?: ProjectSourceRuntime;
}) {
  const runtime = input.runtime ?? defaultRuntime;
  const runtimeAvailable = runtime.available();
  const store = useMemo(
    () => input.vaultHandle ? createVaultFileProjectSourceStore(input.vaultHandle) : null,
    [input.vaultHandle],
  );
  const graphHash = useMemo(
    () => input.projectSlug
      ? buildProjectGraphHash({
          projectSlug: input.projectSlug,
          nodes: input.nodes,
          docs: input.docs,
        })
      : null,
    [input.projectSlug, input.nodes, input.docs],
  );
  const witnesses = useMemo<readonly ProjectSourceWitnessInput[]>(
    () => input.projectSlug
      ? deriveProjectSourceWitnesses({
          projectSlug: input.projectSlug,
          nodes: input.nodes,
          docs: input.docs,
        })
      : [],
    [input.projectSlug, input.nodes, input.docs],
  );
  const [snapshot, setSnapshot] = useState<ProjectSourceSnapshot | null>(null);
  const [proposal, setProposal] = useState<{
    key: string;
    value: ProjectSourceProposedRoot | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ProjectSourceModelError | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    let cancelled = false;
    window.queueMicrotask(() => {
      if (!cancelled && generation.current === currentGeneration) setError(null);
    });
    if (!store || !input.projectSlug || !graphHash) {
      window.queueMicrotask(() => {
        if (!cancelled && generation.current === currentGeneration) setSnapshot(null);
      });
      return () => { cancelled = true; };
    }
    void loadProjectSourceSnapshot({
      store,
      projectSlug: input.projectSlug,
      graphHash,
      inspect: runtimeAvailable ? runtime.inspect : undefined,
    }).then((next) => {
      if (cancelled || generation.current !== currentGeneration) return;
      setSnapshot(next);
      if (next.readStatus === "malformed") setError("sidecar_malformed");
      else if (next.readStatus === "unavailable") setError("sidecar_unavailable");
    });
    return () => { cancelled = true; };
  }, [store, input.projectSlug, graphHash, runtime, runtimeAvailable]);

  /**
   * ["Is this the right folder?", the on-screen prompt] ("Is this the right folder?", the on-screen prompt) — with no new filesystem walk.
   *
   * One `inspect_project_source` call on the vault root already climbs to the
   * enclosing git repository (`src-tauri/src/lib.rs`), so its result *is* the
   * candidate. The app has no reason to scan folders itself, and must not
   * (local-first contract).
   *
   * ⚠️ **The condition must match the screen's** (`.claude/rules/architecture.md`).
   * This measurement runs only at the moment the proposal is actually drawn —
   * that is, when the next action is `connect_source`. An already-connected
   * project has the snapshot measuring its own folder, so measuring again here
   * would make one click pay for two measurements.
   *
   * "M of N declared paths" is **a measurement, not a claim** — it comes from
   * matching real witnesses against the candidate's file list. So a receipt is
   * built in memory purely to read its summary; nothing is written to disk,
   * because committing happens when a person presses the button.
   */
  const vaultRootPath = useMemo(
    () => runtimeAvailable && input.vaultHandle ? runtime.rootPathOf(input.vaultHandle) : null,
    [runtimeAvailable, input.vaultHandle, runtime],
  );
  const proposalWanted = Boolean(
    vaultRootPath
    && graphHash
    && input.projectSlug
    && snapshot
    && snapshot.view.projectSlug === input.projectSlug
    && snapshot.view.nextAction.id === "connect_source",
  );
  const proposalKey = `${input.projectSlug ?? ""}::${proposalWanted ? "want" : "skip"}`;
  useEffect(() => {
    /*
     * When it cannot measure, **no state changes at all.** The read value
     * carries the `key` of what it was read from, so "not read yet" and "read,
     * found nothing" are told apart by `proposalSettled` alone — separating
     * them with an immediate setState inside the effect costs an extra render.
     */
    if (!proposalWanted || !vaultRootPath || !input.projectSlug || !graphHash) return;
    const projectSlug = input.projectSlug;
    let cancelled = false;
    void (async () => {
      let inspection: ProjectSourceInspection | null;
      try {
        inspection = await runtime.inspect(vaultRootPath);
      } catch {
        // A failed inference is not a diagnosis — with no proposal the screen
        // simply falls back to the folder picker.
        inspection = null;
      }
      if (cancelled) return;
      const witnessSummary = inspection && inspection.kind === "git"
        ? buildProjectSourceReceipt({
            projectSlug,
            graphHash,
            probe: probeFromInspection(inspection),
            witnesses,
          }).witnessSummary
        : null;
      const inferred = proposeProjectSourceFromInspection({
        vaultRootPath,
        inspection,
        witnessSummary,
      });
      if (cancelled) return;
      setProposal({
        key: proposalKey,
        value:
          inferred.status === "proposed"
          && inferred.candidate?.marker === "enclosing_git_repository"
          && inferred.confidence !== "low"
            ? {
                rootPath: inferred.candidate.rootPath,
                marker: "enclosing_git_repository",
                confidence: inferred.confidence,
                witnessSummary,
              }
            : null,
      });
    })();
    return () => { cancelled = true; };
  }, [
    proposalWanted,
    proposalKey,
    vaultRootPath,
    input.projectSlug,
    graphHash,
    witnesses,
    runtime,
  ]);
  const proposalSettled = !proposalWanted || proposal?.key === proposalKey;

  /**
   * @param options passing `rootPath` **skips the folder picker** — the branch
   *   that confirms an inference. The measuring and storing code stays **one
   *   copy** shared with the picked-folder case: the moment receipt-writing
   *   forks by where the path came from, one of the two branches starts lying.
   */
  const runNextAction = useCallback(async (options?: { rootPath?: string }) => {
    if (
      !store
      || !input.projectSlug
      || !graphHash
      || !snapshot
      || snapshot.view.projectSlug !== input.projectSlug
      || !runtimeAvailable
      || busy
    ) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const actionGeneration = generation.current;
    setBusy(true);
    setError(null);
    try {
      let rootPath: string | null = null;
      if (sourceActionUsesPicker(snapshot.view)) {
        if (typeof options?.rootPath === "string" && options.rootPath.length > 0) {
          rootPath = options.rootPath;
        } else {
          try {
            rootPath = await runtime.pickRoot(input.pickerTitle);
          } catch {
            setError("picker_failed");
            return;
          }
          if (rootPath === null) return;
        }
      } else if (sourceActionRemeasures(snapshot.view) && snapshot.bindings.length === 1) {
        rootPath = snapshot.bindings[0].rootPath;
      } else {
        return;
      }

      let inspection: ProjectSourceInspection | null;
      try {
        inspection = await runtime.inspect(rootPath);
      } catch {
        inspection = null;
      }
      if (!inspection) {
        setError("measurement_failed");
        return;
      }
      const probe = probeFromInspection(inspection);
      const boundAt = runtime.now();
      const result = await store.replaceAfterMeasurement(
        input.projectSlug,
        {
          projectSlug: input.projectSlug,
          sourceId: probe.sourceId,
          rootPath: inspection.rootPath,
          kind: probe.kind,
          boundAt,
        },
        async () => buildProjectSourceReceipt({
          projectSlug: input.projectSlug!,
          graphHash,
          probe,
          witnesses,
          measuredAt: boundAt,
        }),
      );
      if (generation.current !== actionGeneration) return;
      if (result.status === "replaced") {
        setSnapshot({
          view: deriveProjectSourceView({
            projectSlug: input.projectSlug,
            bindings: result.bindings,
            graphHash,
            probe,
          }),
          bindings: result.bindings.filter((binding) => binding.projectSlug === input.projectSlug),
          readStatus: "ok",
        });
        return;
      }
      const errorByStatus: Partial<Record<typeof result.status, ProjectSourceModelError>> = {
        blocked_malformed: "sidecar_malformed",
        blocked_unavailable: "sidecar_unavailable",
        measurement_failed: "measurement_failed",
        invalid_measurement: "invalid_measurement",
        persistence_failed: "persistence_failed",
      };
      setError(errorByStatus[result.status] ?? "measurement_failed");
    } finally {
      if (generation.current === actionGeneration) setBusy(false);
      if (trigger) runtime.restoreFocus(trigger);
    }
  }, [
    store,
    input.projectSlug,
    graphHash,
    snapshot,
    runtimeAvailable,
    busy,
    runtime,
    witnesses,
    input.pickerTitle,
  ]);

  const snapshotMatchesProject = Boolean(
    snapshot && snapshot.view.projectSlug === input.projectSlug,
  );
  const canRunSourceAction = Boolean(
    runtimeAvailable
    && snapshot
    && snapshotMatchesProject
    && snapshot.readStatus !== "malformed"
    && snapshot.readStatus !== "unavailable"
    && (sourceActionUsesPicker(snapshot.view) || sourceActionRemeasures(snapshot.view)),
  );

  return {
    view: snapshotMatchesProject ? snapshot?.view ?? null : null,
    busy,
    error: snapshotMatchesProject ? error : null,
    runtimeAvailable,
    canRunSourceAction,
    runNextAction,
    /**
     * The "is this the right folder?" proposal; without one the screen is
     * unchanged (just the folder picker). The value carries **what it was read
     * from**, so that for one frame after switching projects another project's
     * inference is not drawn.
     */
    proposedRoot:
      proposal && proposal.key === proposalKey && canRunSourceAction
        ? proposal.value
        : null,
    /**
     * **The signal that keeps the prescription from being drawn twice.**
     *
     * The inference is async, so without this the user sees one "connect code
     * folder" button, then 300 ms later watches it turn into "pick a different
     * folder" and shift upward — right where the pointer already was. While it
     * is unknown what to prescribe, **nothing is prescribed**; the diagnosis
     * stays visible.
     */
    proposalSettled,
  };
}
