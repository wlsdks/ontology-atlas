import {
  collection,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { getDemoProjectsForContainer } from "@/shared/mocks/demo-data";
import { fromFirestore, type Project } from "@/entities/project";

/**
 * P0-B Phase 6 read adapter.
 *
 * `accounts/{accountId}/workspaceProjects/{projectId}` 컨테이너 안의 hubs +
 * nodes 두 서브컬렉션을 동시에 구독해 단일 `Project[]` 로 합친다. 기존
 * `subscribeProjects` (flat) 와 동일 시그니처라 호출처에서 swap 만 하면
 * 토폴로지 그대로 재사용 가능 — 하지만 이번 iter 는 함수만 추가, 실제 호출
 * 전환은 다음 단계.
 *
 * 합치기 규칙:
 *  - hub 문서는 그대로 `Project` (isHub=true) 로 매핑 (migration 시
 *    `toFirestore` 결과 그대로 저장돼 `fromFirestore` 가 즉시 처리).
 *  - node 문서도 그대로 `Project` (isHub=false). `hubIds[]` 는 정보 보존을
 *    위해 필요시 dependencies 와 합쳐주지만, migration 이 이미 dependencies
 *    를 함께 저장했으므로 별도 가공 없이 바로 사용 가능.
 *
 * 한쪽 snapshot 이 먼저 도착해도 마지막 알려진 다른쪽과 합쳐 callback 호출.
 * 양쪽 모두 빈 결과여도 한 번은 callback 으로 빈 배열 전달 (loaded 신호).
 *
 * 실패는 첫 번째 onError 만 옮겨 호출 — 두 구독 중 하나라도 실패하면 전체
 * 로딩이 깨졌다고 봄.
 */
export function subscribeProjectsForContainer(
  accountId: string | null | undefined,
  projectId: string | null | undefined,
  callback: (projects: Project[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const normalizedAccount = normalizeAccountId(accountId);
  const normalizedProject = projectId?.trim() || "general";

  if (!normalizedAccount) {
    Promise.resolve().then(() => callback([]));
    return () => {};
  }
  if (hasDemoSession()) {
    const projects = getDemoProjectsForContainer(
      normalizedAccount,
      normalizedProject,
    );
    Promise.resolve().then(() => callback(projects));
    return () => {};
  }

  const db = getDb();
  const hubsColl = collection(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "hubs",
  );
  const nodesColl = collection(
    db,
    "accounts",
    normalizedAccount,
    "workspaceProjects",
    normalizedProject,
    "nodes",
  );

  let hubs: Project[] = [];
  let nodes: Project[] = [];
  let hubsArrived = false;
  let nodesArrived = false;
  let errored = false;

  const emit = () => {
    if (errored) return;
    if (!hubsArrived || !nodesArrived) return;
    callback([...hubs, ...nodes]);
  };

  const handleError = (error: Error) => {
    if (errored) return;
    errored = true;
    onError?.(error);
  };

  const unsubHubs = onSnapshot(
    hubsColl,
    (snapshot) => {
      hubs = snapshot.docs.map((d) => fromFirestore(d.id, d.data()));
      hubsArrived = true;
      emit();
    },
    handleError,
  );

  const unsubNodes = onSnapshot(
    nodesColl,
    (snapshot) => {
      nodes = snapshot.docs.map((d) => fromFirestore(d.id, d.data()));
      nodesArrived = true;
      emit();
    },
    handleError,
  );

  return () => {
    unsubHubs();
    unsubNodes();
  };
}
