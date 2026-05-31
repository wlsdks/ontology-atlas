import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologySnapshot } from "./ontology-changeset";

/**
 * 변경 baseline 스냅샷의 localStorage 영속화 + 복원-스코프 가드 (Self-Drawing Diff #5
 * 기반). baseline 이 reload 를 넘어 살아남아야 (1) push-move #1 의 "리뷰함" 승인이
 * 보존되고 (2) "자리 비운 사이 무엇이 바뀌었나"(persisted baseline vs 현재 디스크 상태)
 * 를 보여줄 수 있다.
 *
 * **스코프 = content-overlap 가드** (vault-key 스레딩 회피 — FSD 경계상 store 에
 * vault 식별자를 깔끔히 주입하기 어렵다). 단일 baseline 을 영속하되, 복원 시 그
 * baseline 의 노드 집합이 *현재 그래프와 충분히 겹칠 때만* 적용한다. 다른 vault 를
 * 로드하면 겹침 ~0 → 폐기(garbage diff 방지). 같은 vault 면 (에이전트가 추가/일부
 * 변경해도) 겹침 높음 → 복원. 순수 함수 — IO 없음(store 가 localStorage 를 호출).
 */

interface SerializedSnapshot {
  v: 1;
  nodeSigs: [string, string][];
  nodeKinds: [string, string][];
  edgeKeys: string[];
  takenAt: number;
}

export function serializeSnapshot(snap: OntologySnapshot): string {
  const payload: SerializedSnapshot = {
    v: 1,
    nodeSigs: [...snap.nodeSigs],
    nodeKinds: [...snap.nodeKinds],
    edgeKeys: [...snap.edgeKeys],
    takenAt: snap.takenAt,
  };
  return JSON.stringify(payload);
}

/** 역직렬화. 형식이 안 맞으면 null (손상/구버전 → 조용히 무시). */
export function deserializeSnapshot(raw: string | null): OntologySnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<SerializedSnapshot>;
  if (
    p.v !== 1 ||
    !Array.isArray(p.nodeSigs) ||
    !Array.isArray(p.nodeKinds) ||
    !Array.isArray(p.edgeKeys) ||
    typeof p.takenAt !== "number"
  ) {
    return null;
  }
  try {
    return {
      nodeSigs: new Map(p.nodeSigs),
      nodeKinds: new Map(p.nodeKinds),
      edgeKeys: new Set(p.edgeKeys),
      takenAt: p.takenAt,
    };
  } catch {
    return null;
  }
}

/**
 * 영속 baseline 을 현재 그래프에 적용해도 되는지 — content-overlap 스코프 가드.
 * baseline 의 노드 중 *현재 그래프에 여전히 존재하는 비율* 이 threshold 이상이면 true.
 *
 * - 다른 vault 로드: baseline 노드가 현재에 거의 없음 → 비율 ~0 → false(폐기, garbage 방지).
 * - 같은 vault(+에이전트 추가/일부 변경): baseline 노드 대부분 존재 → 비율 높음 → true.
 *   (추가된 노드는 비율 분모(baseline 크기)에 안 들어가므로 추가가 많아도 영향 없음.)
 * - 빈 baseline → false(맞출 게 없음).
 */
export function snapshotMatchesGraph(
  snap: OntologySnapshot,
  currentNodes: readonly KnowledgeGraphNode[],
  threshold = 0.5,
): boolean {
  const total = snap.nodeSigs.size;
  if (total === 0) return false;
  const currentIds = new Set(currentNodes.map((n) => n.id));
  let present = 0;
  for (const id of snap.nodeSigs.keys()) {
    if (currentIds.has(id)) present += 1;
  }
  return present / total >= threshold;
}
