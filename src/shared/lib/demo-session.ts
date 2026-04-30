/**
 * 데모 세션 localStorage 유틸. features/user-auth 의 session-store 는 이 파일의
 * primitive 를 감싸 in-memory 상태를 관리하고, 엔티티 API 는 이 파일의
 * `hasDemoSession()` 만 호출해 Firestore vs demo 분기를 결정한다.
 *
 * shared 층에 두는 이유: 엔티티가 feature 에 의존하면 FSD 레이어가 역행한다.
 * 런타임 의존은 오직 shared 까지만 허용되는 제약을 유지.
 */

export const DEMO_SESSION_STORAGE_KEY = 'aslan:auth:demo-session';

export interface DemoSessionPayload {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: 'demo';
  roles?: string[];
  permissions?: string[];
}

export function readPersistedDemoSession(): DemoSessionPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DemoSessionPayload;
    if (!parsed || parsed.provider !== 'demo' || typeof parsed.uid !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function persistDemoSession(payload: DemoSessionPayload | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (payload) {
      window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(payload));
    } else {
      window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
    }
  } catch {
    // 시크릿 모드 등 localStorage 실패 허용. in-memory 세션은 계속 유지된다.
  }
}

/**
 * 엔티티 API 가 데모 모드인지 빠르게 판정. SSR 시점엔 항상 false 반환해
 * Firestore 분기로 내려간다 (서버 빌드 시 Firestore 직접 접근하지 않음 —
 * 각 엔티티 API 가 build-time fallback 을 별도로 처리).
 */
export function hasDemoSession(): boolean {
  return readPersistedDemoSession() !== null;
}
