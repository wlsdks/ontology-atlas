"use client";

import { useEffect, useRef } from "react";
import { useDataSourceMode } from "@/features/data-source-mode";
import {
  markChangeBaseline,
  shouldAutoMarkBaseline,
  useChangeBaseline,
} from "@/shared/lib/ontology-tree";
import { useOntologyInsight } from "../model/use-ontology-insight";

/**
 * live-web — 로컬 vault 가 로드되면 변경 baseline 을 *자동으로* 1회 잡는다.
 *
 * 그래야 이후 에이전트(MCP)·사람의 vault 편집이 클릭 없이 토폴로지에서 pulse
 * 되고(B1 changedSlugs 경로 재사용) 변경점만 보기/insights 스트립에 즉시 뜬다.
 * "에이전트가 일하는 게 화면에 live 로 보인다" 의 진입 조건.
 *
 * 마운트당 1회만 자동 mark(autoMarkedRef) — 사용자가 명시적으로 Clear 하면
 * 곧장 다시 잡히지 않게(수동 의도 존중). static/dogfood 모드는 변하지 않으니
 * 자동 baseline 없음. 헤드리스(렌더 없음) — layout 의 vault provider 안에 마운트.
 */
export function OntologyLiveBaselineInit() {
  const mode = useDataSourceMode();
  const baseline = useChangeBaseline();
  const { insight } = useOntologyInsight();
  const autoMarkedRef = useRef(false);

  useEffect(() => {
    if (autoMarkedRef.current || !insight) return;
    if (
      shouldAutoMarkBaseline({
        mode,
        hasBaseline: baseline !== null,
        nodeCount: insight.nodes.length,
      })
    ) {
      autoMarkedRef.current = true;
      markChangeBaseline(insight.nodes, insight.edges, Date.now());
    }
  }, [mode, baseline, insight]);

  return null;
}
