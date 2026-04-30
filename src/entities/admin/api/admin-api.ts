import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/shared/api';

const COLLECTION = 'admins';

/**
 * 해당 이메일이 admins 컬렉션에 등록되어 있는지 확인.
 * 화이트리스트 체크의 유일한 진입점.
 */
export async function isAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  try {
    const ref = doc(getDb(), COLLECTION, email);
    const snapshot = await getDoc(ref);
    return snapshot.exists();
  } catch (err) {
    console.error('[isAdmin] 체크 실패:', err);
    return false;
  }
}
