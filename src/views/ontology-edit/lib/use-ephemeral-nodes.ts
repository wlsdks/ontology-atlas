"use client";

import { useCallback, useState } from "react";
import type { ManualNodeKind } from "@/entities/knowledge-graph";

/**
 * palette 클릭으로 추가하는 임시 노드 상태.
 *
 * 캔버스 안 in-memory 상태 — 새로고침 시 사라짐 (의도). 영구화는 인스펙터에서
 * 이름 입력 + 저장 시 vault 의 \`{kind}s/{slug}.md\` 작성 (mission v2: vault
 * frontmatter 가 진실원). id 충돌 회피 위해 timestamp + random suffix.
 */
export interface EphemeralNode {
  id: string;
  kind: Exclude<ManualNodeKind, "document">;
  kindLabel: string;
  title: string;
  x: number;
  y: number;
}

const KIND_LABELS: Record<EphemeralNode["kind"], string> = {
  project: "프로젝트",
  domain: "도메인",
  capability: "역량",
  element: "요소",
};

export function useEphemeralNodes() {
  const [nodes, setNodes] = useState<EphemeralNode[]>([]);
  // palette 클릭마다 약간씩 offset 으로 이전 노드 위에 겹치지 않게.
  const [offset, setOffset] = useState(0);

  // 새로 추가한 노드의 id 를 반환 → caller 가 inspector 자동 select 가능.
  const addNode = useCallback(
    (kind: Exclude<ManualNodeKind, "document">): string => {
      setOffset((prev) => prev + 1);
      const next: EphemeralNode = {
        id: `ephemeral-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        kind,
        kindLabel: KIND_LABELS[kind],
        title: "(이름 입력)",
        // 캔버스 중앙 (대략) + offset 으로 stack 회피.
        x: 240 + offset * 24,
        y: 160 + offset * 24,
      };
      setNodes((prev) => [...prev, next]);
      return next.id;
    },
    [offset],
  );

  const clearAll = useCallback(() => {
    setNodes([]);
    setOffset(0);
  }, []);

  const updateNode = useCallback(
    (id: string, partial: Partial<Pick<EphemeralNode, "title">>) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...partial } : n)),
      );
    },
    [],
  );

  const findById = useCallback(
    (id: string | null): EphemeralNode | null => {
      if (!id) return null;
      return nodes.find((n) => n.id === id) ?? null;
    },
    [nodes],
  );

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { nodes, addNode, clearAll, updateNode, findById, removeNode };
}
