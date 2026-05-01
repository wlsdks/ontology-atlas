import {
  collection,
  deleteDoc,
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
  DEFAULT_STATUSES,
  fromFirestore,
  toFirestore,
  type Status,
  type StatusInput,
} from '../model';

const COLLECTION = 'statuses';

function statusesCollection() {
  return collection(getDb(), COLLECTION);
}

function statusDoc(id: string) {
  return doc(getDb(), COLLECTION, id);
}

/**
 * mission v2 — TaxonomyProvider 가 mode-aware 라 cloud 모드에서만 호출.
 * static / local 모드는 DEFAULT_STATUSES 로 즉시 동작. 이전 hasDemoSession
 * 분기는 PR #37 에서 제거.
 */
export function subscribeStatuses(
  callback: (statuses: Status[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    statusesCollection(),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => fromFirestore(d.id, d.data()))
        .sort((a, b) => a.order - b.order);
      callback(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[subscribeStatuses]', error);
    },
  );
}

export async function upsertStatus(input: StatusInput): Promise<void> {
  const payload = toFirestore(input);
  const ref = statusDoc(input.id);
  await setDoc(
    ref,
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteStatus(id: string): Promise<void> {
  await deleteDoc(statusDoc(id));
}

export async function seedDefaultStatusesIfEmpty(): Promise<boolean> {
  const snap = await getDocs(statusesCollection());
  if (!snap.empty) return false;

  const batch = writeBatch(getDb());
  for (const s of DEFAULT_STATUSES) {
    const ref = statusDoc(s.id);
    batch.set(ref, {
      ...toFirestore(s),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}
