"use client";

import { useEffect, useMemo, useState } from "react";

import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  createVaultFileProjectSourceStore,
  type ProjectSourceStore,
} from "@/shared/lib/project-source-store";

/**
 * **「연결된 코드 폴더가 없다」를 노드 하나를 클릭해야만 볼 수 있던 것**을 지도
 * 옆 INDEX 로 끌어올리기 위한 최소 판정.
 *
 * 실측(2026-08-04): 첫 화면에 그 문장은 0회 나타나고, 프로젝트 노드를 **정확히
 * 그 하나** 클릭해야(픽스처 15노드 · 도그푸드 100+ 노드 중 하나) 비로소 보였다.
 * 진단이 보이지 않으면 처방이 아무리 좋아도 닿지 않는다.
 *
 * ⚠️ **`useProjectSourceModel` 을 하나 더 띄우지 않는다.** 그 훅은 그래프 해시와
 * 증인 목록을 만들고, 설치 앱에서는 폴더를 통째로 훑는 실측(`inspect`)까지 부른다
 * — 선택과 무관하게 상시 도는 자리에 그걸 걸면 **아직 열지도 않은 화면의 계산을
 * 가장 잦은 상호작용이 대신 내는** 그 패턴이 된다(`architecture.md` D4).
 * 여기서 필요한 사실은 하나뿐이다: **이 프로젝트에 묶인 폴더가 0개인가.**
 * 그래서 사이드카 파일 한 번 읽기로 끝난다.
 */
export interface UnboundProjectSource {
  /** 폴더가 하나도 안 묶인 프로젝트 노드의 그래프 id — 클릭하면 그 노드가 열린다. */
  nodeId: string;
  /** 그런 프로젝트가 여럿이면 그 수. 행 문구가 단수/복수를 가른다. */
  count: number;
}

export function useUnboundProjectSource(input: {
  vaultHandle: FileSystemDirectoryHandle | null;
  nodes: readonly KnowledgeGraphNode[];
  /** 테스트용 주입구. 미지정이면 볼트 파일 사이드카를 읽는다. */
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
   * 읽은 값에 **무엇을 읽고 나온 값인지**(`key`)를 함께 담는다. 볼트를 갈아탄
   * 직후 한 프레임 동안 남의 볼트 답이 그려지지 않고, 「아직 안 읽음」을
   * 지우려고 효과 안에서 곧바로 상태를 바꿀 일도 없어진다.
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
       * 읽을 수 없는 상태(`malformed`/`unavailable`)는 **조용히 넘긴다.** 여기는
       * 지도 옆의 조용한 한 줄이라, 파일이 깨졌다는 진단을 낼 자리가 아니다 —
       * 그건 프로젝트를 열었을 때 패널이 제 이름으로 말한다. 잘못 읽은 것을
       * 「폴더 없음」으로 그리면 이 행이 거짓말을 시작한다.
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
    // `projects` 는 매 렌더 새 배열이라 그대로 넣으면 사이드카를 매 렌더 읽는다.
    // 실제로 달라졌는지는 슬러그 목록이 정한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.vaultHandle, input.createStore, projectKey]);

  if (!input.vaultHandle) return null;
  return read && read.key === projectKey ? read.value : null;
}
