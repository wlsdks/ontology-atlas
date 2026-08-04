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
   * `title` 은 **OS 폴더 선택창의 제목**이다. 화면 언어로 넘긴다 — 설치 앱에서
   * 실측(2026-08-04)해 보니 한국어 화면에서 열린 창의 제목만 영어였다
   * (`Connect project code folder`). 앱이 갑자기 다른 사람 말투로 말하는 자리다.
   */
  pickRoot(title?: string): Promise<string | null>;
  inspect(rootPath: string): Promise<ProjectSourceInspection | null>;
  now(): string;
  restoreFocus(element: HTMLElement): void;
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
  /** OS 폴더 선택창 제목 — 호출자가 화면 언어로 넘긴다. */
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

  const runNextAction = useCallback(async () => {
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
        try {
          rootPath = await runtime.pickRoot(input.pickerTitle);
        } catch {
          setError("picker_failed");
          return;
        }
        if (rootPath === null) return;
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
  };
}
