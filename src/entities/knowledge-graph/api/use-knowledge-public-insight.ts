"use client";

import { useEffect, useState } from "react";
import type { KnowledgeProjectInsight } from "../model/types";

/**
 * `knowledgePublic*` projection 의 full insight (nodes + edges + meta) 구독.
 *
 * `useKnowledgePublicNodes` 의 자매 hook — nodes 만 필요한 widget 은 그쪽,
 * edges 도 필요한 페이지 (트리 빌드 / insights / relations) 는 이쪽.
 *
 * 권한 게이팅 · 빈 배열 fallback 같은 패턴.
 */
export interface UseKnowledgePublicInsightResult {
  insight: KnowledgeProjectInsight | null;
  error: Error | null;
}

export function useKnowledgePublicInsight(
  accountId: string | null,
  enabled: boolean = true,
): UseKnowledgePublicInsightResult {
  const [insight, setInsight] = useState<KnowledgeProjectInsight | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setInsight(null);
    setError(null);
    // mode-gate: when caller is on local/static, opening the cloud
    // subscription is a local-first contract violation (4 outbound Firestore
    // Listen requests at runtime). Caller passes `mode === 'cloud'` from
    // `useDataSourceMode()` so the dynamic import + Firestore listener never
    // run outside cloud mode. The dynamic import boundary alone keeps the
    // *static* chunk firebase-clean; this gate keeps the *runtime* clean too.
    if (!enabled) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    void import("./knowledge-graph-api").then(({ subscribeKnowledgePublicGraph }) => {
      if (cancelled) return;
      unsubscribe = subscribeKnowledgePublicGraph(
        accountId,
        (next) => setInsight(next),
        (err) => setError(err),
      );
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [accountId, enabled]);

  return { insight, error };
}
