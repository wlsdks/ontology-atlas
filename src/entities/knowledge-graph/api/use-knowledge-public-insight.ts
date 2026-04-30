"use client";

import { useEffect, useState } from "react";
import type { KnowledgeProjectInsight } from "../model/types";
import { subscribeKnowledgePublicGraph } from "./knowledge-graph-api";

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
): UseKnowledgePublicInsightResult {
  const [insight, setInsight] = useState<KnowledgeProjectInsight | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setInsight(null);
    setError(null);
    const unsubscribe = subscribeKnowledgePublicGraph(
      accountId,
      (next) => setInsight(next),
      (err) => setError(err),
    );
    return () => unsubscribe();
  }, [accountId]);

  return { insight, error };
}
