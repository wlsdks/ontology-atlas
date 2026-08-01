"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
} from "@/shared/lib/ontology-tree";
import { useVaultIdentityScope } from "@/features/vault-scope";
import { useOntologyInsight } from "../model/use-ontology-insight";

/**
 * live-web — 로컬 vault 가 로드되면 변경 baseline 을 처리한다(마운트당 1회):
 *
 * 1. **복원 우선** — reload 전 영속된 baseline 이 있고 현재 그래프와 충분히 겹치면
 *    그걸 복원(restorePersistedBaseline). 그러면 "자리 비운 사이 무엇이 바뀌었나"
 *    (영속 baseline vs 현재 디스크 상태)가 새로고침 후에도 보이고, push-move #1 의
 *    "리뷰함" 승인도 보존된다.
 * 2. **없으면 auto-mark** — 복원할 게 없으면 기존처럼 자동으로 baseline 을 1회 잡는다.
 *
 * 그래야 이후 에이전트(MCP)·사람의 vault 편집이 클릭 없이 토폴로지 fresh
 * 채널, INDEX, 리뷰 링크, 기록 workbench와 activity count에 같은 changeset으로
 * 뜬다.
 *
 * **볼트당 1회** 처리(handledScopeRef) — 사용자가 명시적으로 Clear 하면 곧장
 * 다시 잡히지 않게(수동 의도 존중). static/dogfood 모드는 변하지 않으니
 * auto-mark 없음. 헤드리스(렌더 없음) — layout 의 vault provider 안에 마운트.
 *
 * ## 왜 "마운트당" 이 아니라 "볼트당" 인가 (2026-08-01 수리)
 *
 * 종전엔 `handledRef` 가 boolean 이라 **세션 중 폴더 전환을 못 봤다**. 복원
 * 가드(`snapshotMatchesGraph`)는 이 effect 안에서만 도는데 그 effect 가 다시
 * 안 돌았으니, 메모리에 남은 볼트 A 의 기준이 볼트 B 의 그래프와 대조돼
 * 「자리 비운 사이 N개 바뀜」의 N 이 **B 전체**가 됐다. 범위가 바뀌면 다시
 * 처리한다 — 그리고 스토어는 `setChangeBaselineScope` 를 받는 즉시 앞 볼트의
 * 기준을 버린다.
 */
export function OntologyLiveBaselineInit() {
  const mode = useDataSourceMode();
  const { insight } = useOntologyInsight();
  const vaultScope = useVaultIdentityScope();
  const handledScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!insight) return;
    if (handledScopeRef.current === vaultScope) return;
    handledScopeRef.current = vaultScope;
    // 0) 스토어에 활성 볼트를 알린다 — 범위가 바뀌었으면 여기서 앞 볼트의
    //    기준이 버려지고, 저장/복원 키도 이 볼트의 것으로 바뀐다.
    setChangeBaselineScope(vaultScope);
    // 1) 영속 baseline 복원 시도(겹침 가드) — 복원되면 auto-mark 건너뜀.
    const restored = restorePersistedBaseline(insight.nodes);
    // 2) 복원 못 했고 auto-mark 조건이면 새로 baseline 을 잡는다.
    //    `getChangeBaseline()` 을 직접 읽는다 — 바로 위에서 범위 전환이
    //    기준을 버렸을 수 있는데, 렌더에 실린 값은 아직 앞 볼트의 것이다.
    if (
      !restored &&
      shouldAutoMarkBaseline({
        mode,
        hasBaseline: getChangeBaseline() !== null,
        nodeCount: insight.nodes.length,
      })
    ) {
      markChangeBaseline(insight.nodes, insight.edges, Date.now());
    }
  }, [mode, insight, vaultScope]);

  return null;
}
