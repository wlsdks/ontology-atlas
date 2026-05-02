"use client";

import { useEffect, useState } from "react";
import type { KnowledgeGraphNode } from "../model/types";

/**
 * `knowledgePublic*` projection 의 nodes 만 client-side 구독.
 *
 * 여러 widget (DocumentOntologyEvidenceSection, ProjectOntologyOverview,
 * WorkspaceOntologyStrip, DashboardOntologySummary, ProjectSelectorPage badges,
 * KnowledgeReviewWorkspacePage dedup) 가 같은 패턴 — accountId 받고 nodes 만
 * 필요. 각 widget 의 useEffect + useState + onError boilerplate 를 한 줄로 압축.
 *
 * 권한 게이팅은 Firestore rules — 권한 없거나 에러 시 빈 배열 반환. 페이지
 * 자체 에러로 승격하지 않음 (호출자 widget 이 매치 0 자동 숨김 패턴).
 *
 * 굳이 React Query 같은 무거운 cache 안 쓰는 이유 — Firestore onSnapshot 이
 * 이미 incremental update streaming 함. 단순 wrapper 로 충분.
 */
export function useKnowledgePublicNodes(
  accountId: string | null,
  enabled: boolean = true,
): KnowledgeGraphNode[] {
  const [nodes, setNodes] = useState<KnowledgeGraphNode[]>([]);
  useEffect(() => {
    setNodes([]);
    // mode-gate: caller passes `mode === 'cloud'` from `useDataSourceMode()`
    // to keep the runtime firebase-clean on local/static (the dynamic
    // import boundary alone keeps the *static chunk* clean; this gate keeps
    // the *runtime* clean too — surfaced by the 2026-05-02 perf audit).
    if (!enabled) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("./knowledge-graph-api").then(({ subscribeKnowledgePublicGraph }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgePublicGraph(
        accountId,
        (insight) => setNodes(insight.nodes),
        () => setNodes([]),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId, enabled]);
  return nodes;
}
