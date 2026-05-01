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
  DEFAULT_CATEGORIES,
  fromFirestore,
  toFirestore,
  type Category,
  type CategoryInput,
} from '../model';

const COLLECTION = 'categories';

function categoriesCollection() {
  return collection(getDb(), COLLECTION);
}

function categoryDoc(id: string) {
  return doc(getDb(), COLLECTION, id);
}

/**
 * 전체 카테고리 실시간 구독. order ASC로 정렬해서 반환.
 * 콜백은 Firestore 스냅샷이 올 때마다 호출됨.
 *
 * mission v2 — TaxonomyProvider 가 mode-aware 라 cloud 모드에서만 호출.
 * static / local 모드는 DEFAULT_CATEGORIES 로 즉시 동작. 이전 hasDemoSession
 * 분기는 PR #37 에서 제거 (mission v2 default 흐름과 misalign).
 */
export function subscribeCategories(
  callback: (categories: Category[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    categoriesCollection(),
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => fromFirestore(d.id, d.data()))
        .sort((a, b) => a.order - b.order);
      callback(list);
    },
    (error) => {
      if (onError) onError(error);
      else console.error('[subscribeCategories]', error);
    },
  );
}

/**
 * 카테고리 생성·업데이트 (upsert). id가 있으면 덮어쓰기, 없으면 신규.
 */
export async function upsertCategory(input: CategoryInput): Promise<void> {
  const payload = toFirestore(input);
  const ref = categoryDoc(input.id);
  await setDoc(
    ref,
    {
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * 카테고리 삭제. referential check는 호출자(admin UI)가 수행해야 함.
 */
export async function deleteCategory(id: string): Promise<void> {
  await deleteDoc(categoryDoc(id));
}

/**
 * 빈 DB에 기본 카테고리 seed. 이미 하나라도 있으면 skip.
 * Admin이 직접 호출(수동 시드)하거나, 앱 부트 시 자동 호출.
 */
export async function seedDefaultCategoriesIfEmpty(): Promise<boolean> {
  const snap = await getDocs(categoriesCollection());
  if (!snap.empty) return false;

  const batch = writeBatch(getDb());
  for (const c of DEFAULT_CATEGORIES) {
    const ref = categoryDoc(c.id);
    batch.set(ref, {
      ...toFirestore(c),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return true;
}
