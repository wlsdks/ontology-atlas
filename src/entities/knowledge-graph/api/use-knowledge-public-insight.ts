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
): UseKnowledgePublicInsightResult {
  const [insight, setInsight] = useState<KnowledgeProjectInsight | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setInsight(null);
    setError(null);
    // Firestore SDK 는 dynamic import — vault/local 모드에선 cloud 구독을
    // 호출하지 않아도 (mode-gate) 정적 import 만으로 firebase JS 가
    // 청크에 박히는 걸 막는다.
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
  }, [accountId]);

  return { insight, error };
}
