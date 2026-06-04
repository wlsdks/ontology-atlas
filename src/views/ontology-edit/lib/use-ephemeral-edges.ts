"use client";

import { useCallback, useState } from "react";
import type { Connection } from "@xyflow/react";

/**
 * palette 노드 핸들에서 drag 해 만드는 임시 edge.
 *
 * 캔버스 안 in-memory 상태 — 새로고침 시 사라짐 (의도). 영구화는 인스펙터에서
 * 저장 시 vault 의 .md frontmatter 배열 키 (capabilities / elements /
 * dependencies / relates) 에 직접 append.
 */
export interface EphemeralEdge {
  id: string;
  source: string;
  target: string;
  /** edge type — v1 기본 'related_to' (KnowledgeEdgeType union 의 weak 카테고리). */
  edgeType: "related_to";
}

export function useEphemeralEdges() {
  const [edges, setEdges] = useState<EphemeralEdge[]>([]);

  const addEdgeByIds = useCallback((source: string | null | undefined, target: string | null | undefined) => {
    if (!source || !target) return;
    if (source === target) return; // self-loop 회피
    const id = `ephemeral-edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setEdges((prev) => {
      // 중복 (source-target 동일) 회피.
      const dup = prev.find(
        (e) => e.source === source && e.target === target,
      );
      if (dup) return prev;
      return [
        ...prev,
        {
          id,
          source,
          target,
          edgeType: "related_to",
        },
      ];
    });
  }, []);

  const addEdge = useCallback((connection: Connection) => {
    addEdgeByIds(connection.source, connection.target);
  }, [addEdgeByIds]);

  const clearAll = useCallback(() => {
    setEdges([]);
  }, []);

  const removeEdge = useCallback((id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
  }, []);

  return { edges, addEdge, addEdgeByIds, clearAll, removeEdge };
}
