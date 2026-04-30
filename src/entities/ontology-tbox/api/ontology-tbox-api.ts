import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { getDb } from '@/shared/api';
import {
  DEFAULT_ONTOLOGY_CLASSES,
  fromFirestore as fromClassDoc,
  type OntologyClass,
} from '@/entities/ontology-class';
import {
  DEFAULT_ONTOLOGY_RELATIONS,
  fromFirestore as fromRelationDoc,
  type OntologyRelation,
} from '@/entities/ontology-relation';
import {
  activeStateFromFirestore,
  activeStateToFirestore,
  versionFromFirestore,
  versionToFirestore,
  type OntologyTBoxActiveState,
  type OntologyTBoxActiveStateInput,
  type OntologyTBoxVersion,
  type OntologyTBoxVersionInput,
} from '../model';

const VERSIONS_COLLECTION = 'ontologyTBoxVersions';
const STATE_COLLECTION = 'ontologyTBoxState';

function versionsCollection() {
  return collection(getDb(), VERSIONS_COLLECTION);
}

function versionDoc(versionId: string) {
  return doc(getDb(), VERSIONS_COLLECTION, versionId);
}

function stateDoc(accountId: string) {
  return doc(getDb(), STATE_COLLECTION, accountId);
}

/**
 * 활성 TBox 로드 — fallback chain.
 *
 * 1. `ontologyTBoxState/{accountId}` 의 versionId 읽기
 * 2. `ontologyTBoxVersions/{versionId}` 의 classes/relations 반환
 * 3. (없으면) 기존 mutable `ontologyClasses` / `ontologyRelations` 컬렉션 read
 * 4. (그것도 비었으면) DEFAULT_ONTOLOGY_CLASSES / DEFAULT_ONTOLOGY_RELATIONS
 *
 * 반환에 `versionId` 포함 — 호출자가 fact 노드 만들 때 박을 수 있음.
 * `versionId === 'legacy-v0'` 이면 fallback 단계 (snapshot 없음).
 */
export interface ActiveTBox {
  versionId: string;
  classes: OntologyClass[];
  relations: OntologyRelation[];
}

export async function loadActiveTBox(accountId: string | null): Promise<ActiveTBox> {
  // (1) state 포인터 read.
  if (accountId) {
    try {
      const stateSnap = await getDoc(stateDoc(accountId));
      if (stateSnap.exists()) {
        const state = activeStateFromFirestore(stateSnap.id, stateSnap.data());
        // (2) version snapshot read.
        const versionSnap = await getDoc(versionDoc(state.versionId));
        if (versionSnap.exists()) {
          const version = versionFromFirestore(versionSnap.id, versionSnap.data());
          return {
            versionId: version.versionId,
            classes: version.classes,
            relations: version.relations,
          };
        }
      }
    } catch {
      // 권한 없거나 read 실패 — fallback chain 으로 진행.
    }
  }

  // (3) 기존 mutable 컬렉션 fallback.
  const [classSnap, relationSnap] = await Promise.all([
    getDocs(collection(getDb(), 'ontologyClasses')).catch(() => null),
    getDocs(collection(getDb(), 'ontologyRelations')).catch(() => null),
  ]);

  const classes: OntologyClass[] =
    classSnap && !classSnap.empty
      ? classSnap.docs
          .map((d) => fromClassDoc(d.id, d.data()))
          .sort((a, b) => a.id.localeCompare(b.id))
      : DEFAULT_ONTOLOGY_CLASSES.map((input) => ({
          ...input,
          createdAt: new Date(0),
          updatedAt: undefined,
        }));

  const relations: OntologyRelation[] =
    relationSnap && !relationSnap.empty
      ? relationSnap.docs
          .map((d) => fromRelationDoc(d.id, d.data()))
          .sort((a, b) => a.id.localeCompare(b.id))
      : DEFAULT_ONTOLOGY_RELATIONS.map((input) => ({
          ...input,
          createdAt: new Date(0),
          updatedAt: undefined,
        }));

  return { versionId: 'legacy-v0', classes, relations };
}

/**
 * 새 TBox version 생성 + 활성화 (한 액션).
 *
 * `runTransaction` 대신 두 setDoc — version doc 은 한 번 쓰면 immutable
 * (rules 가 update 차단), state doc 은 마지막 setDoc 으로 swap.
 * 실패 시 version 만 만들어지고 state 가 안 바뀌면 다음 호출이 같은 version
 * 으로 재활성화 가능 (idempotent).
 */
export async function createTBoxVersion(
  input: OntologyTBoxVersionInput,
): Promise<{ versionId: string }> {
  const versionId = input.versionId;
  if (!versionId) {
    throw new Error('createTBoxVersion: versionId is required');
  }
  await setDoc(versionDoc(versionId), {
    ...versionToFirestore(input),
    createdAt: serverTimestamp(),
  });
  return { versionId };
}

export async function activateTBoxVersion(
  input: OntologyTBoxActiveStateInput,
): Promise<void> {
  await setDoc(stateDoc(input.accountId), {
    ...activeStateToFirestore(input),
    activatedAt: serverTimestamp(),
  });
}

/** account 의 TBox version 목록 (history view 용). createdAt desc. */
export async function listTBoxVersions(
  accountId: string,
  limit = 50,
): Promise<OntologyTBoxVersion[]> {
  const q = query(versionsCollection(), where('accountId', '==', accountId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => versionFromFirestore(d.id, d.data()))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

/** 활성 state 한 번 read (구독 안 하는 호출자용). */
export async function getActiveTBoxState(
  accountId: string,
): Promise<OntologyTBoxActiveState | null> {
  try {
    const snap = await getDoc(stateDoc(accountId));
    if (!snap.exists()) return null;
    return activeStateFromFirestore(snap.id, snap.data());
  } catch {
    return null;
  }
}

/**
 * 새 version ID 생성. epoch ms 기반 — 충돌 회피 + 정렬 가능 + 사용자 표시용
 * 짧은 문자열. 호환: 형식 자유 (spec §5.1) 라 미래 변경 가능.
 *
 * 별도 함수로 둬 test 가 deterministic 시점 주입 가능.
 */
export function generateTBoxVersionId(now: Date = new Date()): string {
  return `v-${now.getTime()}`;
}

/**
 * 활성 TBox 의 classes 배열에 새 클래스 1개 추가한 새 version 을 생성 +
 * 활성화. duplicate ID 검사는 호출자가 미리 (UI dedup hint 같은 흐름) 또는
 * Firestore 가 reject (그러나 setDoc 은 overwrite 라 직접 reject 안 함 —
 * UI 에서 사전 검사 필수).
 *
 * 단계:
 *   1. version doc 작성 (immutable, rules 가 update 차단)
 *   2. state doc swap (활성 versionId 갱신)
 *
 * 실패 시 (1) 만 성공하면 다음 호출이 같은 version 재활성화 (idempotent).
 * (2) 만 성공할 일은 (1) 이 실패하면 안 일어남 — 순서 보장.
 */
export interface AppendClassAndActivateInput {
  accountId: string;
  current: ActiveTBox;
  newClass: OntologyClass;
  createdBy: string;
  changeNote?: string;
  /** 테스트에서 시점 주입. */
  now?: Date;
}

export async function appendClassAndActivate(
  input: AppendClassAndActivateInput,
): Promise<{ versionId: string }> {
  const { accountId, current, newClass, createdBy, changeNote } = input;
  const now = input.now ?? new Date();
  const versionId = generateTBoxVersionId(now);
  const nextClasses = [...current.classes, newClass].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  await createTBoxVersion({
    versionId,
    accountId,
    createdBy,
    changeNote: changeNote ?? `클래스 추가: ${newClass.id}`,
    classes: nextClasses,
    relations: current.relations,
  });
  await activateTBoxVersion({
    accountId,
    versionId,
    activatedBy: createdBy,
  });
  return { versionId };
}

/**
 * appendClassAndActivate 와 동일 패턴 — 관계 1 개 추가 + 새 version 활성화.
 * 호출자가 미리 OntologyRelation 객체를 만들어 넘김 (id 충돌 사전 검사 포함).
 */
export interface AppendRelationAndActivateInput {
  accountId: string;
  current: ActiveTBox;
  newRelation: OntologyRelation;
  createdBy: string;
  changeNote?: string;
  now?: Date;
}

export async function appendRelationAndActivate(
  input: AppendRelationAndActivateInput,
): Promise<{ versionId: string }> {
  const { accountId, current, newRelation, createdBy, changeNote } = input;
  const now = input.now ?? new Date();
  const versionId = generateTBoxVersionId(now);
  const nextRelations = [...current.relations, newRelation].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  await createTBoxVersion({
    versionId,
    accountId,
    createdBy,
    changeNote: changeNote ?? `관계 추가: ${newRelation.id}`,
    classes: current.classes,
    relations: nextRelations,
  });
  await activateTBoxVersion({
    accountId,
    versionId,
    activatedBy: createdBy,
  });
  return { versionId };
}

/**
 * 활성 TBox 의 한 클래스 metadata (name / description / parentClassId) 만
 * 갱신한 새 version 을 생성 + 활성화. id 는 immutable (fact node.kind 와 묶임).
 *
 * patch 는 partial — 정의된 필드만 갱신. parentClassId 를 빈 문자열로 명시하면
 * undefined 로 처리 (root 클래스로 변경).
 */
export interface UpdateClassMetadataAndActivateInput {
  accountId: string;
  current: ActiveTBox;
  classId: string;
  patch: {
    name?: string;
    description?: string;
    parentClassId?: string;
  };
  createdBy: string;
  changeNote?: string;
  now?: Date;
}

export async function updateClassMetadataAndActivate(
  input: UpdateClassMetadataAndActivateInput,
): Promise<{ versionId: string }> {
  const { accountId, current, classId, patch, createdBy, changeNote } = input;
  const idx = current.classes.findIndex((cls) => cls.id === classId);
  if (idx === -1) {
    throw new Error(`updateClassMetadataAndActivate: class '${classId}' not found in active TBox`);
  }
  const target = current.classes[idx]!;
  const nextClass = {
    ...target,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.parentClassId !== undefined
      ? patch.parentClassId === ''
        ? { parentClassId: undefined }
        : { parentClassId: patch.parentClassId }
      : {}),
    updatedAt: new Date(),
  };
  const nextClasses = [...current.classes];
  nextClasses[idx] = nextClass;
  // id 는 변경되지 않으므로 정렬 그대로 유지.
  const now = input.now ?? new Date();
  const versionId = generateTBoxVersionId(now);
  await createTBoxVersion({
    versionId,
    accountId,
    createdBy,
    changeNote: changeNote ?? `클래스 수정: ${classId}`,
    classes: nextClasses,
    relations: current.relations,
  });
  await activateTBoxVersion({
    accountId,
    versionId,
    activatedBy: createdBy,
  });
  return { versionId };
}
