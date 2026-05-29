import { useSyncExternalStore } from "react";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { snapshotOntology, type OntologySnapshot } from "./ontology-changeset";

/**
 * 변경점 baseline 공유 스토어 — module-level singleton.
 *
 * /ontology(변경 패널)에서 "기준 찍기"를 하면, 그 baseline 을 /topology 등 다른
 * surface 도 같은 값으로 본다. React context 대신 module store + useSyncExternalStore
 * 로, App Router client-side 네비게이션 사이에서 상태가 유지된다(회의 중 화면을
 * 오가며 같은 변경점을 본다는 시나리오). 세션 내 in-memory — 전체 reload 까지
 * 살리는 sessionStorage 영속화는 후속(스냅샷 fast-follow).
 *
 * SSR/정적 export 안전: 모듈 로드 시 브라우저 API 를 만지지 않고 baseline 은
 * null 로 시작. getServerSnapshot 도 null.
 */
let baseline: OntologySnapshot | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function markChangeBaseline(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  takenAt: number,
): void {
  baseline = snapshotOntology(nodes, edges, takenAt);
  emit();
}

export function clearChangeBaseline(): void {
  baseline = null;
  emit();
}

export function getChangeBaseline(): OntologySnapshot | null {
  return baseline;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** baseline 스냅샷을 구독하는 hook. mark/clear 시 리렌더. */
export function useChangeBaseline(): OntologySnapshot | null {
  return useSyncExternalStore(subscribe, getChangeBaseline, () => null);
}
