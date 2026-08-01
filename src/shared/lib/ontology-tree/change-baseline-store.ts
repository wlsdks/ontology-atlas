import { useSyncExternalStore } from "react";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  snapshotOntology,
  type OntologySnapshot,
} from "./ontology-changeset";
import {
  deserializeSnapshot,
  serializeSnapshot,
  snapshotMatchesGraph,
} from "./change-baseline-persist";

// 변경 baseline 을 reload 너머 보존(Self-Drawing Diff #5 기반). 비파괴 — 리뷰
// 상태만 저장, vault(.md) 미변경.
//
// ## 왜 키에 볼트가 들어가나 (2026-08-01 수리)
//
// 종전엔 **전역 키 하나**였다. 내용은 볼트별인데 자리가 하나라 둘이 부딪혔다:
//
// 1. 볼트 A 에서 기준을 찍고 B 를 열면 B 의 첫 mark 가 A 의 기준을 **덮어썼다**.
//    A 로 돌아왔을 때 "자리 비운 사이 무엇이 바뀌었나" 의 기준이 사라져 있다.
// 2. content-overlap 가드(`snapshotMatchesGraph`)는 **복원 시점에만** 돈다.
//    세션 중에 폴더를 바꾸면 아무도 안 물어보므로, 메모리에 남은 A 의 기준이
//    B 의 그래프와 대조돼 **B 전체가 「새로 추가됨」** 으로 세어졌다.
//
// 그래서 키를 볼트별로 나누고(①), 활성 범위가 바뀌는 순간 메모리의 기준을
// 즉시 버린다(② — `setChangeBaselineScope`). 겹침 가드는 남긴다: 같은 폴더
// 이름으로 완전히 다른 볼트를 여는 경우의 두 번째 그물이다.
const PERSIST_KEY_PREFIX = "demo:change-baseline:v1:";
/**
 * 볼트를 모르던 시절의 전역 키. **되읽지 않는다** — 그 값이 어느 볼트의
 * 것인지 알 방법이 없고, 되읽는 것이 바로 위 결함이다. 처음 범위가 정해질 때
 * 한 번 치운다(안 치우면 아무도 안 읽는 값이 영원히 남는다).
 */
const LEGACY_UNSCOPED_KEY = "demo:change-baseline:v1";

/**
 * 지금 화면이 보고 있는 볼트. `null` 이면 아직 아무도 안 알려준 것이고, 그
 * 동안에는 **아무것도 저장하지도 복원하지도 않는다** — 어느 볼트의 기준인지
 * 모르는 baseline 은 그 자체로 거짓 판정의 입력이다(fail closed).
 */
let baselineScope: string | null = null;

function persistBaseline(snap: OntologySnapshot | null): void {
  if (typeof window === "undefined" || baselineScope === null) return;
  try {
    const key = `${PERSIST_KEY_PREFIX}${baselineScope}`;
    if (snap) window.localStorage.setItem(key, serializeSnapshot(snap));
    else window.localStorage.removeItem(key);
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

/**
 * **활성 볼트가 무엇인지 알린다** — 바뀌면 앞 볼트의 기준을 그 자리에서 버린다.
 *
 * 이걸 부르지 않으면 baseline 은 저장도 복원도 되지 않는다(fail closed). 화면
 * 어딘가에서 조용히 "기준이 있다" 고 판정하는 것보다, 아무 기준도 없는 편이
 * 정직하다.
 *
 * 소비처는 `OntologyLiveBaselineInit` 하나다 — 그 컴포넌트가 layout 에 상주해
 * 볼트 범위를 이 스토어에 흘려 넣고, 범위가 바뀌면 복원/자동 기준을 다시
 * 처리한다.
 */
export function setChangeBaselineScope(scope: string): void {
  if (baselineScope === scope) return;
  const first = baselineScope === null;
  baselineScope = scope;
  if (first && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(LEGACY_UNSCOPED_KEY);
    } catch {
      /* private mode — skip */
    }
  }
  if (baseline !== null) {
    baseline = null;
    emit();
  }
}

/** 지금 스토어가 알고 있는 볼트 범위 (시험·진단용). */
export function getChangeBaselineScope(): string | null {
  return baselineScope;
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
  if (baselineScope === null) return false;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(`${PERSIST_KEY_PREFIX}${baselineScope}`);
  } catch {
    return false;
  }
  const snap = deserializeSnapshot(raw);
  if (!snap || !snapshotMatchesGraph(snap, nodes)) return false;
  baseline = snap;
  emit();
  return true;
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
