'use client';

import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '@/shared/api';
import {
  persistDemoSession as persistDemoSessionStorage,
  readPersistedDemoSession as readPersistedDemoSessionStorage,
} from '@/shared/lib/demo-session';
import { disableDevAdminBypass } from '@/features/permissions/model/dev-bypass';

export type AuthProviderKind = 'firebase' | 'demo';
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
let demoSession: AuthSessionUser | null = null;

function readPersistedDemoSession(): AuthSessionUser | null {
  const payload = readPersistedDemoSessionStorage();
  return payload as AuthSessionUser | null;
}

function persistDemoSession(user: AuthSessionUser | null) {
  persistDemoSessionStorage(
    user && user.provider === 'demo'
      ? {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          provider: 'demo',
          roles: user.roles,
          permissions: user.permissions,
        }
      : null,
  );
}

function emit() {
  subscribers.forEach((listener) => listener());
}

function setState(nextState: UserAuthState) {
  state = nextState;
  emit();
}

function recomputeState() {
  if (demoSession) {
    setState({ status: 'authenticated', user: demoSession });
    return;
  }

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

export function initializeUserAuthStore() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  demoSession = readPersistedDemoSession();

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

export function signInWithLocalDemo(input?: {
  email?: string;
  displayName?: string;
}): AuthSessionUser {
  const user: AuthSessionUser = {
    uid: 'demo-viewer-local',
    email: input?.email?.trim() || 'demo-viewer@local',
    displayName: input?.displayName?.trim() || '데모 뷰어',
    provider: 'demo',
    roles: ['viewer'],
    permissions: [],
  };
  demoSession = user;
  persistDemoSession(user);
  recomputeState();
  return user;
}

function clearDemoSession() {
  if (!demoSession) return;
  demoSession = null;
  persistDemoSession(null);
  recomputeState();
}

export function hasDemoSession() {
  if (demoSession) return true;
  if (typeof window === 'undefined') return false;
  // Provider 가 초기화되기 전에 entity API 가 먼저 호출될 수 있어
  // localStorage 를 직접 조회해 early-return 을 보강한다.
  const persisted = readPersistedDemoSession();
  if (persisted) {
    demoSession = persisted;
    recomputeState();
    return true;
  }
  return false;
}

export async function signOutCombined() {
  disableDevAdminBypass();
  clearDemoSession();

  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  firebaseResolved = true;
  firebaseUser = null;
  recomputeState();
}

export async function fetchSessionProfile(): Promise<AuthSessionUser | null> {
  return state.user;
}
