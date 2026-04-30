import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { getDb } from '@/shared/api/firebase';
import { getFirebaseAuth } from '@/shared/api/firebase';
import type { CreateSharedDocInput, SharedDoc } from '../model/types';

const COLLECTION = 'sharedDocs';

/**
 * 랜덤 URL-safe 토큰 생성. 12자. `/share?t={token}` URL 로 사용되므로
 * 짧게 유지. crypto.getRandomValues 기반.
 */
function generateToken(): string {
  const bytes = new Uint8Array(9);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  // base64url (rfc4648 §5) — = 제거, + → -, / → _.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function createSharedDoc(
  input: CreateSharedDocInput,
): Promise<{ token: string; url: string }> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다');
  const token = generateToken();
  const db = getDb();
  const ref = doc(collection(db, COLLECTION), token);
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? Timestamp.fromDate(
          new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
        )
      : null;
  await setDoc(ref, {
    slug: input.slug,
    title: input.title,
    content: input.content,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    expiresAt,
    maxViews: input.maxViews ?? null,
    viewCount: 0,
  });
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return { token, url: `${base}/share/?t=${encodeURIComponent(token)}` };
}

/**
 * 공개 조회. 만료·초과 여부는 client 에서 확인 (rules 는 public read 허용).
 * 성공 시 viewCount + 1.
 */
export async function getSharedDoc(token: string): Promise<{
  doc: SharedDoc | null;
  expired: boolean;
  overLimit: boolean;
}> {
  const db = getDb();
  const ref = doc(collection(db, COLLECTION), token);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { doc: null, expired: false, overLimit: false };
  const data = snap.data();
  const shared: SharedDoc = {
    token,
    slug: data.slug ?? '',
    title: data.title ?? '',
    content: data.content ?? '',
    createdBy: data.createdBy ?? '',
    createdAt:
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : new Date(),
    expiresAt:
      data.expiresAt instanceof Timestamp
        ? data.expiresAt.toDate()
        : null,
    maxViews:
      typeof data.maxViews === 'number' ? data.maxViews : null,
    viewCount: typeof data.viewCount === 'number' ? data.viewCount : 0,
  };
  const now = new Date();
  const expired =
    shared.expiresAt !== null && shared.expiresAt.getTime() <= now.getTime();
  const overLimit =
    shared.maxViews !== null && shared.viewCount >= shared.maxViews;
  if (!expired && !overLimit) {
    // 조회수 +1 — 실패해도 UI 영향 없음
    try {
      await updateDoc(ref, { viewCount: increment(1) });
    } catch {
      /* ignore */
    }
  }
  return { doc: shared, expired, overLimit };
}
