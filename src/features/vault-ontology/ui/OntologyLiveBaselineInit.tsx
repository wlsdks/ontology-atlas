"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  markChangeBaseline,
  restorePersistedBaseline,
  shouldAutoMarkBaseline,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
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
 * 그래야 이후 에이전트(MCP)·사람의 vault 편집이 클릭 없이 토폴로지에서 pulse 되고
 * 변경점만 보기/insights 스트립에 즉시 뜬다.
 *
 * 마운트당 1회만 처리(handledRef) — 사용자가 명시적으로 Clear 하면 곧장 다시
 * 잡히지 않게(수동 의도 존중). static/dogfood 모드는 변하지 않으니 auto-mark 없음.
 * 헤드리스(렌더 없음) — layout 의 vault provider 안에 마운트.
 */
export function OntologyLiveBaselineInit() {
  const mode = useDataSourceMode();
  const baseline = useChangeBaseline();
  const { insight } = useOntologyInsight();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || !insight) return;
    handledRef.current = true;
    // 1) 영속 baseline 복원 시도(겹침 가드) — 복원되면 auto-mark 건너뜀.
    const restored = restorePersistedBaseline(insight.nodes);
    // 2) 복원 못 했고 auto-mark 조건이면 새로 baseline 을 잡는다.
    if (
      !restored &&
      shouldAutoMarkBaseline({
        mode,
        hasBaseline: baseline !== null,
        nodeCount: insight.nodes.length,
      })
    ) {
      markChangeBaseline(insight.nodes, insight.edges, Date.now());
    }
  }, [mode, baseline, insight]);

  return null;
}
