'use client';

import type { User as FirebaseUser } from 'firebase/auth';

export type AuthProviderKind = 'firebase';
export type UserAuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

export interface AuthSessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider: AuthProviderKind;
  roles?: string[];
  permissions?: string[];
}

export interface UserAuthState {
  status: UserAuthStatus;
  user: AuthSessionUser | null;
}

type Listener = () => void;

const subscribers = new Set<Listener>();

let state: UserAuthState = { status: 'loading', user: null };
let initialized = false;
let firebaseResolved = false;
let firebaseUser: AuthSessionUser | null = null;

function emit() {
  subscribers.forEach((listener) => listener());
}

function setState(nextState: UserAuthState) {
  state = nextState;
  emit();
}

function recomputeState() {
  if (!firebaseResolved) {
    setState({ status: 'loading', user: null });
    return;
  }

  setState({
    status: firebaseUser ? 'authenticated' : 'unauthenticated',
    user: firebaseUser,
  });
}

function mapFirebaseUser(user: FirebaseUser): AuthSessionUser {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    provider: 'firebase',
  };
}

export function subscribeUserAuth(listener: Listener) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function getUserAuthState() {
  return state;
}

/**
 * Firebase Auth 모듈은 dynamic import 로만 진입한다 — local-first 첫 paint
 * 에서 auth SDK 청크 (~150kb gzipped) 가 다운로드되지 않게.
 *
 * 호출자 (`useUserAuth`) 는 fire-and-forget 으로 호출. 초기화 완료 전엔
 * `state.status === 'loading'` 으로 시작하며, onAuthStateChanged 또는 2.5s
 * 타임아웃이 도달하면 unauthenticated/authenticated 로 전환된다.
 */
export async function initializeUserAuthStore() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const [{ onAuthStateChanged }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/auth'),
    import('@/shared/api'),
  ]);
  const auth = getFirebaseAuth();
  // onAuthStateChanged 가 네트워크 지연으로 영원히 fire 안 될 수 있어 2.5 초
  // 안에 콜 안 오면 unauthenticated 로 낙관 결정. 이후 실제 세션이 도착하면
  // 그 때 state 가 authenticated 로 전환된다.
  const AUTH_INIT_TIMEOUT_MS = 2500;
  let firebaseInitTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    if (!firebaseResolved) {
      firebaseResolved = true;
      recomputeState();
    }
    firebaseInitTimer = null;
  }, AUTH_INIT_TIMEOUT_MS);
  onAuthStateChanged(auth, (user) => {
    if (firebaseInitTimer) {
      clearTimeout(firebaseInitTimer);
      firebaseInitTimer = null;
    }
    firebaseUser = user ? mapFirebaseUser(user) : null;
    firebaseResolved = true;
    recomputeState();
  });
}

export async function signOutCombined() {
  const [{ signOut: firebaseSignOut }, { getFirebaseAuth }] = await Promise.all([
    import('firebase/auth'),
    import('@/shared/api'),
  ]);
  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  firebaseResolved = true;
  firebaseUser = null;
  recomputeState();
}

export async function fetchSessionProfile(): Promise<AuthSessionUser | null> {
  return state.user;
}
