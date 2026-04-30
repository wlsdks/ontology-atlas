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
  DEFAULT_ONTOLOGY_RELATIONS,
  fromFirestore,
  toFirestore,
  type OntologyRelation,
  type OntologyRelationInput,
} from '../model';

const COLLECTION = 'ontologyRelations';

function relationsCollection() {
  return collection(getDb(), COLLECTION);
}

function relationDoc(id: string) {
  return doc(getDb(), COLLECTION, id);
}

/**
 * 전체 ontology 관계 타입 실시간 구독. category 그룹 후 id ASC 로 정렬.
 * (structure → behavior → evidence → weak 순)
 */
export function subscribeOntologyRelations(
  callback: (relations: OntologyRelation[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const categoryOrder = { structure: 0, behavior: 1, evidence: 2, weak: 3 } as const;
  return onSnapshot(
    relationsCollection(),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => fromFirestore(d.id, d.data()))
        .sort((a, b) => {
          const ca = categoryOrder[a.category];
          const cb = categoryOrder[b.category];
          if (ca !== cb) return ca - cb;
          return a.id.localeCompare(b.id);
        });
      callback(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[subscribeOntologyRelations]', error);
    },
  );
}

export async function upsertOntologyRelation(input: OntologyRelationInput): Promise<void> {
  const payload = toFirestore(input);
  await setDoc(
    relationDoc(input.id),
    {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * 빈 컬렉션에 기본 ontology 관계 7 종 시드.
 */
export async function seedDefaultOntologyRelationsIfEmpty(): Promise<boolean> {
  const snap = await getDocs(relationsCollection());
  if (!snap.empty) return false;

  const batch = writeBatch(getDb());
  for (const relation of DEFAULT_ONTOLOGY_RELATIONS) {
    batch.set(relationDoc(relation.id), {
      ...toFirestore(relation),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}
