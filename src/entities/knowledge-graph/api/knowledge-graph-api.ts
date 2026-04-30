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
import { httpsCallable } from "firebase/functions";
import { getDb, getFirebaseAuth, getFirebaseFunctions } from "@/shared/api";
import {
  requestDevAdminApproveKnowledgeOutput,
  requestDevAdminPublishKnowledgeProjection,
} from "@/shared/api/dev-admin-proxy";
import { normalizeAccountId } from "@/shared/lib/account-scope";
import { isDevAdminBypassActive } from "@/shared/lib/dev-admin-bypass";
import { hasDemoSession } from '@/shared/lib/demo-session';
import {
  composeManualEdgeId,
  fromFirestoreKnowledgeGraphEdge,
  fromFirestoreKnowledgeGraphNode,
  fromFirestoreKnowledgePublicMeta,
  getDemoKnowledgeProjectInsight,
  validateManualKnowledgeEdgeInput,
  validateManualKnowledgeNodeInput,
  MANUAL_EDGE_ERROR_MESSAGE,
  MANUAL_NODE_ERROR_MESSAGE,
  type AddManualKnowledgeEdgeInput,
  type AddManualKnowledgeNodeInput,
  type ApproveKnowledgeOutputInput,
  type RejectKnowledgeOutputInput,
  type RejectKnowledgeOutputResult,
  type ApproveKnowledgeOutputResult,
  type KnowledgeProjectInsight,
  type PublishKnowledgeProjectionInput,
  type PublishKnowledgeProjectionResult,
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

function publicMetaDoc(accountId?: string | null) {
  const scopedAccountId = normalizeAccountId(accountId);
  return doc(
    getDb(),
    PUBLIC_META_COLLECTION,
    scopedAccountId ? `current__${scopedAccountId}` : "current",
  );
}

export async function approveKnowledgeOutput(
  input: ApproveKnowledgeOutputInput,
): Promise<ApproveKnowledgeOutputResult> {
  if (isDevAdminBypassActive()) {
    return requestDevAdminApproveKnowledgeOutput(input);
  }

  const callable = httpsCallable<
    ApproveKnowledgeOutputInput & { action: "approve_output" },
    ApproveKnowledgeOutputResult
  >(getFirebaseFunctions(), "applyReviewAction");

  const response = await callable({
    ...input,
    action: "approve_output",
  });
  return response.data;
}

/**
 * Output 의 일부 또는 전체 후보를 거절. T-11 정확도 측정의 분모(전체 후보 =
 * approve + reject) 보존이 목적. dev-admin bypass 는 측정 흐름에서 사용하지
 * 않으므로 production callable 만 호출한다.
 */
export async function rejectKnowledgeOutput(
  input: RejectKnowledgeOutputInput,
): Promise<RejectKnowledgeOutputResult> {
  const callable = httpsCallable<
    RejectKnowledgeOutputInput & { action: "reject_output" },
    RejectKnowledgeOutputResult
  >(getFirebaseFunctions(), "applyReviewAction");

  const response = await callable({
    ...input,
    action: "reject_output",
  });
  return response.data;
}

export async function publishKnowledgeProjection(
  input: PublishKnowledgeProjectionInput,
): Promise<PublishKnowledgeProjectionResult> {
  if (isDevAdminBypassActive()) {
    return requestDevAdminPublishKnowledgeProjection(input);
  }

  const callable = httpsCallable<
    PublishKnowledgeProjectionInput,
    PublishKnowledgeProjectionResult
  >(getFirebaseFunctions(), "publishKnowledgeProjection");
  const response = await callable(input);
  return response.data;
}

export async function listKnowledgeProjectInsight(
  projectId: string,
  accountId?: string | null,
): Promise<KnowledgeProjectInsight> {
  if (hasDemoSession()) {
    return getDemoKnowledgeProjectInsight(projectId, accountId);
  }

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
  const metaSnapshot = await getDoc(publicMetaDoc(scopedAccountId));

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
  if (hasDemoSession()) {
    Promise.resolve().then(() => callback(null));
    return () => {};
  }
  const scopedAccountId = normalizeAccountId(accountId);
  return onSnapshot(
    publicMetaDoc(scopedAccountId),
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
  // 데모 모드는 knowledge 파이프라인이 존재하지 않으므로 빈 insight를 비동기
  // 콜백으로 한 번 넘기고 끝. Firestore에 연결 시도하지 않는다.
  if (hasDemoSession()) {
    Promise.resolve().then(() =>
      callback(getDemoKnowledgeProjectInsight(projectId, accountId)),
    );
    return () => {};
  }
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
    publicMetaDoc(scopedAccountId),
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
  if (hasDemoSession()) {
    Promise.resolve().then(() =>
      callback(getDemoKnowledgeProjectInsight("__all__", accountId)),
    );
    return () => {};
  }
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
    publicMetaDoc(scopedAccountId),
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
  if (hasDemoSession()) {
    Promise.resolve().then(() =>
      callback(getDemoKnowledgeProjectInsight("__all__", accountId)),
    );
    return () => {};
  }
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
// Manual editor v0 (B 라인) — 사용자가 추출 워커 거치지 않고 직접 노드 작성.
//
// 동작:
// - runTransaction 으로 같은 ID 노드 존재 여부 확인 → 있으면 alreadyExists=true
//   반환 (§6.3.2 케이스 B). UI 가 "기존 보기 / 다른 ID" 두 옵션 제시.
// - 없으면 setDoc with source="manual" + manualAuthor=auth.uid + serverTimestamp.
// - Firestore rules (firestore.rules `knowledgeApprovedNodes` create) 가 같은
//   제약을 서버에서도 강제 — kind 화이트리스트, manualAuthor==auth.uid,
//   account member, title 비어있지 않음.
//
// 참조: 2026-04-27-ontology-manual-editor-v0.md §3 / §6.3
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

// ─────────────────────────────────────────────────────────────────────────────
// T-13 — stub placeholder 관리 (promote / dismiss + list subscription)
//
// stub 노드는 `knowledgeApprovedNodes` 에 `isStub: true` 로 저장된다 (T-12).
// 검수자가 promote (kind 선택) 또는 dismiss 한다. 둘 다 server-side mutation
// (admin 권한) 이라 callable Cloud Function 으로 라우팅.
//
// 참조: 2026-04-27-ontology-id-resolution.md §2 / functions/index.js promoteStubNodeCore
// ─────────────────────────────────────────────────────────────────────────────

export interface StubNode {
  id: string;
  accountId?: string;
  title: string;
  kind: "unknown";
  projectIds: string[];
  evidenceIds: string[];
  isStub: true;
  /** frontmatter 가 명시한 원본 edge type — promote 시 복원될 type. */
  pendingType?: string;
  /** promote 시 복원될 source canonical ID. */
  pendingFromId?: string;
}

export interface PromoteStubInput {
  nodeId: string;
  newKind: "project" | "domain" | "capability" | "element" | "document";
  accountId?: string | null;
}

export interface PromoteStubResult {
  fromNodeId: string;
  toNodeId: string;
  edgesAffected: number;
}

export interface DismissStubInput {
  nodeId: string;
  accountId?: string | null;
  /** soft-delete 사유 — 진안이 잘못 dismiss 했을 때 단서, 빈 값 OK. */
  reason?: string;
}

export interface DismissStubResult {
  nodeId: string;
  edgesDeleted: number;
}

/** Firestore raw → StubNode. isStub=true 이고 soft-delete 안 된 doc 만 통과. */
function fromFirestoreStubNode(id: string, data: DocumentData): StubNode | null {
  if (data.isStub !== true) return null;
  if (data.deletedAt) return null;
  return {
    id,
    ...(typeof data.accountId === "string" ? { accountId: data.accountId } : {}),
    title: typeof data.title === "string" ? data.title : id,
    kind: "unknown",
    projectIds: Array.isArray(data.projectIds)
      ? (data.projectIds as unknown[]).filter((p): p is string => typeof p === "string")
      : [],
    evidenceIds: Array.isArray(data.evidenceIds)
      ? (data.evidenceIds as unknown[]).filter((p): p is string => typeof p === "string")
      : [],
    isStub: true,
    ...(typeof data.pendingType === "string" ? { pendingType: data.pendingType } : {}),
    ...(typeof data.pendingFromId === "string"
      ? { pendingFromId: data.pendingFromId }
      : {}),
  };
}

/**
 * stub 노드 실시간 구독 — knowledgeApprovedNodes 에서 isStub=true 인 것만.
 * admin 만 read 가능 (firestore.rules). account-scoped 필터링.
 */
export function subscribeStubNodes(
  accountId: string | null | undefined,
  callback: (stubs: StubNode[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (hasDemoSession()) {
    Promise.resolve().then(() => callback([]));
    return () => {};
  }
  const scopedAccountId = normalizeAccountId(accountId);
  return onSnapshot(
    query(collection(getDb(), APPROVED_NODES_COLLECTION), where("isStub", "==", true)),
    (snapshot) => {
      const stubs = snapshot.docs
        .map((d) => fromFirestoreStubNode(d.id, d.data()))
        .filter((s): s is StubNode => s !== null)
        .filter((s) => (s.accountId ?? null) === scopedAccountId);
      callback(stubs);
    },
    (error) => {
      if (onError) onError(error);
      else console.error("[subscribeStubNodes]", error);
    },
  );
}

/** stub 을 진짜 노드로 승격. server-side mutation (admin 권한 필수). */
export async function promoteStubNode(
  input: PromoteStubInput,
): Promise<PromoteStubResult> {
  const callable = httpsCallable<PromoteStubInput, PromoteStubResult>(
    getFirebaseFunctions(),
    "promoteStubNode",
  );
  const response = await callable(input);
  return response.data;
}

/** stub 을 잘못된 reference 로 판단해 삭제. server-side. */
export async function dismissStubNode(
  input: DismissStubInput,
): Promise<DismissStubResult> {
  const callable = httpsCallable<DismissStubInput, DismissStubResult>(
    getFirebaseFunctions(),
    "dismissStubNode",
  );
  const response = await callable(input);
  return response.data;
}
