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
   * `title` 은 **OS 폴더 선택창의 제목**이다. 화면 언어로 넘긴다 — 설치 앱에서
   * 실측(2026-08-04)해 보니 한국어 화면에서 열린 창의 제목만 영어였다
   * (`Connect project code folder`). 앱이 갑자기 다른 사람 말투로 말하는 자리다.
   */
  pickRoot(title?: string): Promise<string | null>;
  inspect(rootPath: string): Promise<ProjectSourceInspection | null>;
  /**
   * 볼트 폴더의 **절대 경로**. 추정의 유일한 입력이고, 이것이 없는 표면(웹)에서는
   * 추정 자체가 성립하지 않는다 — 브라우저는 고른 폴더가 디스크 어디에 있는지
   * 모른다.
   */
  rootPathOf(handle: FileSystemDirectoryHandle): string | null;
  now(): string;
  restoreFocus(element: HTMLElement): void;
}

/**
 * **「이 폴더 맞나요?」의 데이터.** 화면이 그릴 자격이 있는 제안만 여기 담긴다 —
 * 확신이 낮거나(`low`) 후보가 없으면 `null` 이고, 그때 화면은 종전처럼 폴더
 * 선택창 하나만 그린다. 회색 버튼을 두지 않는다는 계약이 여기서 지켜진다.
 */
export interface ProjectSourceProposedRoot {
  rootPath: string;
  /** 오늘 앱이 낼 수 있는 유일한 근거 — 볼트를 감싸는 git 저장소. */
  marker: "enclosing_git_repository";
  confidence: "high" | "medium";
  /** 후보를 **실제로 재서** 나온 값. 없으면(선언된 경로 0개) 비율을 주장하지 않는다. */
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
   * **「이 폴더 맞나요?」 — 새 파일시스템 순회는 없다.**
   *
   * 볼트 루트로 `inspect_project_source` 를 한 번 부르면 그 명령이 이미 감싸는
   * git 저장소까지 올라간다(`src-tauri/src/lib.rs`). 그러니 그 결과가 곧 후보다.
   * 앱이 폴더를 따로 훑을 이유가 없고, 훑어서도 안 된다(local-first 계약).
   *
   * ⚠️ **조건이 화면과 같아야 한다** (`architecture.md` D4). 이 측정은 제안이
   * 실제로 그려지는 순간 — 즉 다음 행동이 `connect_source` 일 때 — 에만 돈다.
   * 이미 연결된 프로젝트는 스냅샷 쪽이 자기 폴더를 재고 있으므로, 여기서 한 번
   * 더 재면 같은 클릭이 실측을 두 번 내게 된다.
   *
   * 「선언된 경로 N개 중 M개」는 **주장이 아니라 측정**이다 — 후보의 파일 목록에
   * 실제 증인을 대조해서 나온다. 그래서 영수증을 한 장 메모리에서 찍어 요약만
   * 꺼내 쓴다(디스크에는 아무것도 쓰지 않는다 — 확정은 사람이 누를 때다).
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
     * 못 재는 경우에는 **아무 상태도 안 바꾼다.** 읽은 값에 무엇을 읽고 나온
     * 값인지(`key`)를 함께 담아 두었으므로, 「아직 못 읽음」과 「읽었더니
     * 없음」이 아래 `proposalSettled` 하나로 갈린다 — 그 둘을 구분하려고 효과
     * 안에서 곧바로 setState 하면 렌더가 한 번 더 돈다.
     */
    if (!proposalWanted || !vaultRootPath || !input.projectSlug || !graphHash) return;
    const projectSlug = input.projectSlug;
    let cancelled = false;
    void (async () => {
      let inspection: ProjectSourceInspection | null;
      try {
        inspection = await runtime.inspect(vaultRootPath);
      } catch {
        // 추정 실패는 진단이 아니다 — 제안이 없으면 화면은 폴더 선택창으로 간다.
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
   * @param options `rootPath` 를 주면 **폴더 선택창을 건너뛴다** — 추정 확정용
   *   갈래다. 재는 코드와 저장하는 코드는 폴더를 고른 경우와 **한 벌**이다:
   *   경로가 어디서 왔든 영수증을 찍는 절차가 갈리면 그 순간 둘 중 하나가
   *   거짓말을 시작한다.
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
     * 「이 폴더 맞나요?」 — 없으면 화면은 종전 그대로(폴더 선택창 하나)다.
     * 읽고 나온 값에 **무엇을 읽고 나온 값인지**를 함께 담아, 프로젝트를 갈아탄
     * 직후 한 프레임 동안 남의 추정이 그려지지 않게 한다.
     */
    proposedRoot:
      proposal && proposal.key === proposalKey && canRunSourceAction
        ? proposal.value
        : null,
    /**
     * **처방을 두 번 그리지 않기 위한 신호.**
     *
     * 추정은 비동기라, 이것 없이 그리면 사용자는 먼저 「코드 폴더 연결하기」
     * 버튼 하나를 보고 300ms 뒤에 그 버튼이 「다른 폴더 고르기」로 바뀌면서
     * 위로 밀려나는 것을 본다 — 마우스가 이미 가 있던 자리다. 무엇을 처방할지
     * 아직 모르는 동안에는 **처방하지 않는다**(진단은 그대로 보인다).
     */
    proposalSettled,
  };
}
