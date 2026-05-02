import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { getDb, getFirebaseAuth } from "@/shared/api";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import {
  composeManualEdgeId,
  fromFirestoreKnowledgeGraphEdge,
  fromFirestoreKnowledgeGraphNode,
  fromFirestoreKnowledgePublicMeta,
  validateManualKnowledgeEdgeInput,
  validateManualKnowledgeNodeInput,
  MANUAL_EDGE_ERROR_MESSAGE,
  MANUAL_NODE_ERROR_MESSAGE,
  type AddManualKnowledgeEdgeInput,
  type AddManualKnowledgeNodeInput,
  type KnowledgeProjectInsight,
} from "@/entities/knowledge-graph/model";

const PUBLIC_NODES_COLLECTION = "knowledgePublicNodes";
const PUBLIC_EDGES_COLLECTION = "knowledgePublicEdges";
const PUBLIC_META_COLLECTION = "knowledgePublicMeta";
const APPROVED_NODES_COLLECTION = "knowledgeApprovedNodes";
// APPROVED_EDGES_COLLECTION 은 line 409 부근 로컬 const — A2-3 export 가
// graph subscribe 단계에서 같은 이름을 참조해야 해 한 곳으로 모아 두어도
// 됐지만, 기존 manual-edge writer 와 충돌 없으므로 두 정의 모두 동일
// 문자열 ("knowledgeApprovedEdges") 로 유지. 향후 통합 시 한 const 로.

function publicNodesCollection() {
  return collection(getDb(), PUBLIC_NODES_COLLECTION);
}

function publicEdgesCollection() {
  return collection(getDb(), PUBLIC_EDGES_COLLECTION);
}

function approvedNodesCollection() {
  return collection(getDb(), APPROVED_NODES_COLLECTION);
}

function approvedEdgesCollection() {
  return collection(getDb(), "knowledgeApprovedEdges");
}

function publicMetaDoc() {
  return doc(getDb(), PUBLIC_META_COLLECTION, "current");
}

export async function listKnowledgeProjectInsight(
  projectId: string,
  accountId?: string | null,
): Promise<KnowledgeProjectInsight> {
  const scopedAccountId = normalizeAccountId(accountId);
  const nodeSnapshot = await getDocs(
    query(
      publicNodesCollection(),
      where("projectIds", "array-contains", projectId),
    ),
  );
  const edgeSnapshot = await getDocs(
    query(
      publicEdgesCollection(),
      where("projectIds", "array-contains", projectId),
    ),
  );
  const metaSnapshot = await getDoc(publicMetaDoc());

  return {
    nodes: nodeSnapshot.docs
      .map((entry) => fromFirestoreKnowledgeGraphNode(entry.id, entry.data()))
      .filter((entry) => (entry.accountId ?? null) === scopedAccountId),
    edges: edgeSnapshot.docs
      .map((entry) => fromFirestoreKnowledgeGraphEdge(entry.id, entry.data()))
      .filter((entry) => (entry.accountId ?? null) === scopedAccountId),
    meta: metaSnapshot.exists()
      ? fromFirestoreKnowledgePublicMeta(metaSnapshot.id, metaSnapshot.data())
      : null,
  };
}

/**
 * 워크스페이스 스코프의 현재 공개 반영 메타 단독 구독. AdminKnowledgeDashboard
 * 요약 카드처럼 project 와 무관한 "마지막 publish 언제?" 표시용.
 * 데모 세션은 파이프라인이 없으므로 즉시 null emit.
 */
export function subscribeKnowledgePublicMeta(
  accountId: string | null | undefined,
  callback: (meta: import("@/entities/knowledge-graph/model").KnowledgePublicMeta | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const scopedAccountId = normalizeAccountId(accountId);
  return onSnapshot(
    publicMetaDoc(),
    (snapshot) => {
      callback(
        snapshot.exists()
          ? fromFirestoreKnowledgePublicMeta(snapshot.id, snapshot.data())
          : null,
      );
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgePublicMeta]", error);
    },
  );
}

export function subscribeKnowledgeProjectInsight(
  projectId: string,
  accountId: string | null | undefined,
  callback: (insight: KnowledgeProjectInsight) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const scopedAccountId = normalizeAccountId(accountId);
  let latestNodes = [] as KnowledgeProjectInsight["nodes"];
  let latestEdges = [] as KnowledgeProjectInsight["edges"];
  let latestMeta = null as KnowledgeProjectInsight["meta"];

  const emit = () => {
    callback({
      nodes: latestNodes,
      edges: latestEdges,
      meta: latestMeta,
    });
  };

  const unsubscribeNodes = onSnapshot(
    query(
      publicNodesCollection(),
      where("projectIds", "array-contains", projectId),
    ),
    (snapshot) => {
      latestNodes = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphNode(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgeProjectInsight:nodes]", error);
    },
  );

  const unsubscribeEdges = onSnapshot(
    query(
      publicEdgesCollection(),
      where("projectIds", "array-contains", projectId),
    ),
    (snapshot) => {
      latestEdges = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphEdge(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgeProjectInsight:edges]", error);
    },
  );

  const unsubscribeMeta = onSnapshot(
    publicMetaDoc(),
    (snapshot) => {
      latestMeta = snapshot.exists()
        ? fromFirestoreKnowledgePublicMeta(snapshot.id, snapshot.data())
        : null;
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgeProjectInsight:meta]", error);
    },
  );

  return () => {
    unsubscribeNodes();
    unsubscribeEdges();
    unsubscribeMeta();
  };
}

/**
 * 전역 ontology 구독 — `knowledgePublic{Nodes,Edges,Meta}` 의 account-scoped
 * 모두를 한 번에 받는다 (`/ontology` view 가 사용).
 *
 * subscribeKnowledgeProjectInsight 와 달리 projectId 필터 없음. 즉 같은
 * 계정의 모든 ontology 노드를 합쳐서 단일 트리로 본다.
 */
export function subscribeKnowledgePublicGraph(
  accountId: string | null | undefined,
  callback: (insight: KnowledgeProjectInsight) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const scopedAccountId = normalizeAccountId(accountId);
  let latestNodes = [] as KnowledgeProjectInsight["nodes"];
  let latestEdges = [] as KnowledgeProjectInsight["edges"];
  let latestMeta = null as KnowledgeProjectInsight["meta"];

  const emit = () => {
    callback({ nodes: latestNodes, edges: latestEdges, meta: latestMeta });
  };

  const unsubscribeNodes = onSnapshot(
    publicNodesCollection(),
    (snapshot) => {
      latestNodes = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphNode(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgePublicGraph:nodes]", error);
    },
  );

  const unsubscribeEdges = onSnapshot(
    publicEdgesCollection(),
    (snapshot) => {
      latestEdges = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphEdge(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgePublicGraph:edges]", error);
    },
  );

  const unsubscribeMeta = onSnapshot(
    publicMetaDoc(),
    (snapshot) => {
      latestMeta = snapshot.exists()
        ? fromFirestoreKnowledgePublicMeta(snapshot.id, snapshot.data())
        : null;
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgePublicGraph:meta]", error);
    },
  );

  return () => {
    unsubscribeNodes();
    unsubscribeEdges();
    unsubscribeMeta();
  };
}

/**
 * Approved (private canonical) graph 구독 — `knowledgeApproved{Nodes,Edges}`.
 *
 * `subscribeKnowledgePublicGraph` 와 모양 동일하지만 1 차 진실원 (publish
 * 전 포함) 을 본다. 백업 / 외부 채점 (golden fixture) 에서 사용.
 *
 * 정책:
 * - meta 는 public projection 만 갖는 개념이라 항상 null 로 emit (호출자가
 *   같은 KnowledgeProjectInsight 시그니처를 쓸 수 있게).
 * - rules 는 account member 만 read 허용 — 멤버가 아니면 onError emit.
 */
export function subscribeKnowledgeApprovedGraph(
  accountId: string | null | undefined,
  callback: (insight: KnowledgeProjectInsight) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const scopedAccountId = normalizeAccountId(accountId);
  let latestNodes = [] as KnowledgeProjectInsight["nodes"];
  let latestEdges = [] as KnowledgeProjectInsight["edges"];

  const emit = () => {
    callback({ nodes: latestNodes, edges: latestEdges, meta: null });
  };

  const unsubscribeNodes = onSnapshot(
    approvedNodesCollection(),
    (snapshot) => {
      latestNodes = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphNode(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgeApprovedGraph:nodes]", error);
    },
  );

  const unsubscribeEdges = onSnapshot(
    approvedEdgesCollection(),
    (snapshot) => {
      latestEdges = snapshot.docs
        .map((entry) => fromFirestoreKnowledgeGraphEdge(entry.id, entry.data()))
        .filter((entry) => (entry.accountId ?? null) === scopedAccountId);
      emit();
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeKnowledgeApprovedGraph:edges]", error);
    },
  );

  return () => {
    unsubscribeNodes();
    unsubscribeEdges();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual editor — 사용자가 직접 ontology 노드 작성하는 cloud-mode 경로.
// (mission v2 default 흐름은 vault frontmatter 직접 작성 — vault.createDoc.
// 이 함수는 cloud 모드에서 동등 동작.)
//
// 동작:
// - runTransaction 으로 같은 ID 노드 존재 여부 확인 → 있으면 alreadyExists=true
//   반환. UI 가 "기존 보기 / 다른 ID" 두 옵션 제시.
// - 없으면 setDoc with source="manual" + manualAuthor=auth.uid + serverTimestamp.
// - Firestore rules (`knowledgeApprovedNodes` create) 가 같은 제약을 서버에서도
//   강제 — kind 화이트리스트, manualAuthor==auth.uid, account member, title
//   비어있지 않음.
// ─────────────────────────────────────────────────────────────────────────────

export interface AddManualKnowledgeNodeResult {
  id: string;
  /** §6.3.2 케이스 B — 같은 ID 가 이미 다른 source 로 존재. write 안 함. */
  alreadyExists: boolean;
}

export async function addManualKnowledgeNode(
  input: AddManualKnowledgeNodeInput,
): Promise<AddManualKnowledgeNodeResult> {
  const validation = validateManualKnowledgeNodeInput(input);
  if (!validation.ok) {
    const messages = validation.errors
      .map((code) => MANUAL_NODE_ERROR_MESSAGE[code])
      .join(' / ');
    throw new Error(`addManualKnowledgeNode: invalid input — ${messages}`);
  }

  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('addManualKnowledgeNode: not authenticated');
  }

  const db = getDb();
  const trimmedId = input.id.trim();
  const ref = doc(db, APPROVED_NODES_COLLECTION, trimmedId);

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists()) {
      return { id: trimmedId, alreadyExists: true };
    }
    tx.set(ref, {
      accountId: input.accountId,
      title: input.title.trim(),
      kind: input.kind,
      projectIds: input.projectIds ?? [],
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(input.summary ? { summary: input.summary } : {}),
      evidenceIds: [],
      lastApprovedAt: serverTimestamp(),
      lastApprovedBy: uid,
      source: 'manual',
      manualAuthor: uid,
      ...(input.manualNote ? { manualNote: input.manualNote } : {}),
    });
    return { id: trimmedId, alreadyExists: false };
  });
}

const APPROVED_EDGES_COLLECTION = "knowledgeApprovedEdges";

export interface AddManualKnowledgeEdgeResult {
  id: string;
  /** 같은 (type, from, to) edge 가 이미 존재. backend 가 같은 ID 로 dedup. */
  alreadyExists: boolean;
}

/**
 * Manual edge 직접 작성. 노드와 동일 패턴 (transaction race-safe).
 * 같은 (type, from, to) 튜플은 자연스럽게 같은 ID 가 되어 dedup. 이미
 * 있으면 alreadyExists=true. UI 가 "기존 관계 보기" 안내.
 */
export async function addManualKnowledgeEdge(
  input: AddManualKnowledgeEdgeInput,
): Promise<AddManualKnowledgeEdgeResult> {
  const validation = validateManualKnowledgeEdgeInput(input);
  if (!validation.ok) {
    const messages = validation.errors
      .map((code) => MANUAL_EDGE_ERROR_MESSAGE[code])
      .join(' / ');
    throw new Error(`addManualKnowledgeEdge: invalid input — ${messages}`);
  }

  const auth = getFirebaseAuth();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('addManualKnowledgeEdge: not authenticated');
  }

  const db = getDb();
  const trimmedFrom = input.from.trim();
  const trimmedTo = input.to.trim();
  const edgeId = composeManualEdgeId(input.type, trimmedFrom, trimmedTo);
  const ref = doc(db, APPROVED_EDGES_COLLECTION, edgeId);

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists()) {
      return { id: edgeId, alreadyExists: true };
    }
    tx.set(ref, {
      from: trimmedFrom,
      to: trimmedTo,
      type: input.type,
      accountId: input.accountId,
      projectIds: input.projectIds ?? [],
      ...(input.label ? { label: input.label } : {}),
      evidenceIds: [],
      lastApprovedAt: serverTimestamp(),
      lastApprovedBy: uid,
      source: 'manual',
      manualAuthor: uid,
      ...(input.manualNote ? { manualNote: input.manualNote } : {}),
    });
    return { id: edgeId, alreadyExists: false };
  });
}

