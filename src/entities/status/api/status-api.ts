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
import { deleteDevAdminDocument, upsertDevAdminDocument } from '@/shared/api/dev-admin-proxy';
import { isDevAdminBypassActive } from '@/shared/lib/dev-admin-bypass';
import { hasDemoSession } from '@/shared/lib/demo-session';
import { getDemoStatuses } from '@/shared/mocks/demo-data';
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

export function subscribeStatuses(
  callback: (statuses: Status[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (hasDemoSession()) {
    const list = getDemoStatuses();
    Promise.resolve().then(() => callback(list));
    return () => {};
  }

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
  if (isDevAdminBypassActive()) {
    await upsertDevAdminDocument(COLLECTION, input.id, payload);
    return;
  }

  const ref = statusDoc(input.id);
  await setDoc(
    ref,
    { ...payload, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteStatus(id: string): Promise<void> {
  if (isDevAdminBypassActive()) {
    await deleteDevAdminDocument(COLLECTION, id);
    return;
  }
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
