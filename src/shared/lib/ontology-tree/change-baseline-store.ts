import { useSyncExternalStore } from "react";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  acknowledgeNodeChange,
  snapshotOntology,
  type OntologySnapshot,
} from "./ontology-changeset";
import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotMatchesGraph,
} from "./change-baseline-persist";

// 변경 baseline 을 reload 너머 보존(Self-Drawing Diff #5 기반): 단일 키 영속 +
// 복원 시 content-overlap 가드(snapshotMatchesGraph)로 다른 vault 의 stale baseline
// 폐기. 비파괴 — 리뷰 상태만 저장, vault(.md) 미변경.
const PERSIST_KEY = "demo:change-baseline:v1";

function persistBaseline(snap: OntologySnapshot | null): void {
  if (typeof window === "undefined") return;
  try {
    if (snap) window.localStorage.setItem(PERSIST_KEY, serializeSnapshot(snap));
    else window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* private mode — skip */
  }
}

/**
 * 변경점 baseline 공유 스토어 — module-level singleton.
 *
 * /ontology(변경 패널)에서 "기준 찍기"를 하면, 그 baseline 을 /topology 등 다른
 * surface 도 같은 값으로 본다. React context 대신 module store + useSyncExternalStore
 * 로, App Router client-side 네비게이션 사이에서 상태가 유지된다(회의 중 화면을
 * 오가며 같은 변경점을 본다는 시나리오). 전체 reload 너머로도 살아남는다 —
 * baseline 을 localStorage 에 영속하고 restorePersistedBaseline 이 content-overlap
 * 가드로 복원한다(아래 PERSIST_KEY · change-baseline-persist.ts).
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
  persistBaseline(baseline);
  emit();
}

export function clearChangeBaseline(): void {
  baseline = null;
  persistBaseline(null);
  emit();
}

/**
 * reload 후 영속된 baseline 을 복원 — *현재 그래프와 충분히 겹칠 때만*(다른 vault
 * 폐기). 이미 baseline 이 있으면 복원 안 함(덮어쓰기 방지). 복원했으면 true →
 * 호출자(OntologyLiveBaselineInit)는 auto-mark 를 건너뛴다. 비파괴.
 */
export function restorePersistedBaseline(
  nodes: readonly KnowledgeGraphNode[],
): boolean {
  if (typeof window === "undefined" || baseline !== null) return false;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PERSIST_KEY);
  } catch {
    return false;
  }
  const snap = deserializeSnapshot(raw);
  if (!snap || !snapshotMatchesGraph(snap, nodes)) return false;
  baseline = snap;
  emit();
  return true;
}

/**
 * 한 노드의 변경을 "리뷰함" 으로 표시 — 그 노드만 baseline 을 advance(per-node).
 * 그 노드는 변경 패널/토폴로지 pulse 에서 빠지고(모든 surface 일관), 이후 재편집되면
 * 재-flag 된다. baseline 없으면 no-op. 비파괴(vault 미변경).
 */
export function acknowledgeChangeNode(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): void {
  const next = acknowledgeNodeChange(baseline, nodeId, nodes, edges);
  if (next === baseline) return; // no-op(baseline null) — 불필요한 emit 회피
  baseline = next;
  persistBaseline(baseline); // 승인(per-node advance)도 reload 너머 보존
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

/**
 * live 모드(live-web): 로컬 vault 가 로드되어 노드가 있고 아직 baseline 이
 * 없으면 자동으로 기준을 잡을지 결정. 이후 에이전트 편집이 클릭 없이 pulse.
 * static/dogfood 모드는 변하지 않으니 자동 baseline 없음.
 *
 * *호출자(OntologyLiveBaselineInit)는 마운트당 1회만 자동 mark* — 그래야 사용자가
 * 명시적으로 Clear 했을 때 곧장 다시 잡히지 않는다(수동 의도 존중).
 */
export function shouldAutoMarkBaseline(input: {
  mode: "static" | "local";
  hasBaseline: boolean;
  nodeCount: number;
}): boolean {
  return input.mode === "local" && !input.hasBaseline && input.nodeCount > 0;
}
