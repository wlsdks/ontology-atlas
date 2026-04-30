import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDb } from '@/shared/api';
import {
  DEFAULT_ONTOLOGY_CLASSES,
  fromFirestore,
  toFirestore,
  type OntologyClass,
  type OntologyClassInput,
} from '../model';

const COLLECTION = 'ontologyClasses';

function classesCollection() {
  return collection(getDb(), COLLECTION);
}

function classDoc(id: string) {
  return doc(getDb(), COLLECTION, id);
}

/**
 * 전체 ontology 클래스 실시간 구독. id ASC 정렬.
 * 4-layer 트리 (project → domain → capability → element) 표시 시
 * 사용자 코드가 별도로 정렬·계층화 가능.
 */
export function subscribeOntologyClasses(
  callback: (classes: OntologyClass[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    classesCollection(),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => fromFirestore(d.id, d.data()))
        .sort((a, b) => a.id.localeCompare(b.id));
      callback(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[subscribeOntologyClasses]', error);
    },
  );
}

/**
 * Ontology 클래스 upsert. id 가 있으면 덮어쓰기, 없으면 신규.
 * createdAt 은 신규 시에만 set, updatedAt 은 항상 갱신.
 */
export async function upsertOntologyClass(input: OntologyClassInput): Promise<void> {
  const payload = toFirestore(input);
  await setDoc(
    classDoc(input.id),
    {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * 빈 컬렉션에 기본 ontology 클래스 5 종 시드. 이미 하나라도 있으면 skip.
 * T-1d (seed 스크립트) 가 호출하거나, 운영자가 수동 트리거.
 */
export async function seedDefaultOntologyClassesIfEmpty(): Promise<boolean> {
  const snap = await getDocs(classesCollection());
  if (!snap.empty) return false;

  const batch = writeBatch(getDb());
  for (const cls of DEFAULT_ONTOLOGY_CLASSES) {
    batch.set(classDoc(cls.id), {
      ...toFirestore(cls),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}
