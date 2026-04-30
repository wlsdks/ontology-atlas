'use client';

import { onAuthStateChanged, signOut as firebaseSignOut, type User as FirebaseUser } from 'firebase/auth';
import { getFirebaseAuth } from '@/shared/api';
import { env } from '@/shared/config/env';
import {
  persistDemoSession as persistDemoSessionStorage,
  readPersistedDemoSession as readPersistedDemoSessionStorage,
} from '@/shared/lib/demo-session';
import { disableDevAdminBypass } from '@/features/permissions/model/dev-bypass';

export type AuthProviderKind = 'iam' | 'firebase' | 'demo';
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

interface IamTokenUser {
  id: string;
  roles?: string[];
  permissions?: string[];
}

interface IamTokenResponse {
  requiresTwoFactor?: boolean;
  accessToken?: string | null;
  tokenType?: string | null;
  expiresIn?: number | null;
  user?: IamTokenUser | null;
}

interface IamSession {
  accessToken: string;
  expiresAt: number;
  user: AuthSessionUser;
}

interface IamMeResponse {
  id: string;
  roles: string[];
  permissions: string[];
}

type Listener = () => void;

const subscribers = new Set<Listener>();

let state: UserAuthState = { status: 'loading', user: null };
let initialized = false;
let firebaseResolved = false;
let iamResolved = false;
let firebaseUser: AuthSessionUser | null = null;
let iamSession: IamSession | null = null;
let demoSession: AuthSessionUser | null = null;
let refreshPromise: Promise<AuthSessionUser | null> | null = null;

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

  if (!firebaseResolved || !iamResolved) {
    setState({ status: 'loading', user: null });
    return;
  }

  const activeUser = iamSession?.user ?? firebaseUser;
  setState({
    status: activeUser ? 'authenticated' : 'unauthenticated',
    user: activeUser,
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

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  if (typeof window === 'undefined' || typeof window.atob !== 'function') {
    return {};
  }
  const decoded = window.atob(padded);
  return JSON.parse(decoded) as Record<string, unknown>;
}

function getIamBaseUrl() {
  return env.NEXT_PUBLIC_IAM_BASE_URL?.trim() || '';
}

function isIamEnabled() {
  return Boolean(getIamBaseUrl());
}

function buildIamSession(
  response: IamTokenResponse,
  fallback?: { email?: string | null; displayName?: string | null },
): IamSession {
  if (!response.accessToken) {
    throw new Error('IAM access token이 응답에 없습니다.');
  }

  const claims = decodeJwtPayload(response.accessToken);
  const resolvedUserId =
    response.user?.id ??
    (typeof claims.sub === 'string' ? claims.sub : null);

  if (!resolvedUserId) {
    throw new Error('IAM 사용자 정보를 확인할 수 없습니다.');
  }

  const email =
    fallback?.email ??
    (typeof claims.email === 'string' ? claims.email : null) ??
    null;

  return {
    accessToken: response.accessToken,
    expiresAt: Date.now() + (response.expiresIn ?? 900) * 1000,
    user: {
      uid: resolvedUserId,
      email,
      displayName: fallback?.displayName ?? null,
      provider: 'iam',
      roles: response.user?.roles ?? (Array.isArray(claims.roles) ? claims.roles.map(String) : []),
      permissions:
        response.user?.permissions ??
        (Array.isArray(claims.permissions) ? claims.permissions.map(String) : []),
    },
  };
}

function applyIamSession(session: IamSession | null) {
  iamSession = session;
  recomputeState();
}

async function postToIam<TResponse>(
  path: string,
  init: RequestInit,
): Promise<TResponse> {
  const baseUrl = getIamBaseUrl();
  if (!baseUrl) {
    throw new Error('IAM 인증 서버가 설정되지 않았습니다.');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.text();
  const data = payload ? (JSON.parse(payload) as TResponse & { detail?: string }) : null;

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('이메일 또는 비밀번호를 다시 확인해주세요.');
    }
    if (response.status === 409) {
      throw new Error('이미 가입된 이메일입니다. 로그인 화면에서 다시 시도하세요.');
    }
    if (response.status === 429) {
      throw new Error('요청이 많습니다. 잠시 후 다시 시도해주세요.');
    }
    if (data && typeof data === 'object' && 'detail' in data && typeof data.detail === 'string') {
      throw new Error(data.detail);
    }
    throw new Error('IAM 인증 처리에 실패했습니다.');
  }

  return data as TResponse;
}

async function refreshIamInternal(): Promise<AuthSessionUser | null> {
  if (!isIamEnabled()) {
    iamResolved = true;
    recomputeState();
    return null;
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await postToIam<IamTokenResponse>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const session = buildIamSession(response);
      applyIamSession(session);
      return session.user;
    } catch {
      applyIamSession(null);
      return null;
    } finally {
      iamResolved = true;
      refreshPromise = null;
      recomputeState();
    }
  })();

  return refreshPromise;
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
  // `onAuthStateChanged` 는 정상 상황에선 즉시 (user=null 혹은 restored
  // user) 콜 되지만, 네트워크가 끊기거나 Firebase 엔드포인트가 지연되면
  // 영원히 fire 안 될 수 있다. 그 동안 UI 는 "확인 중" 스피너로 스톨.
  // 2.5초 안에 콜 못 받으면 unauthenticated 로 낙관 결정하고 진행. 이후
  // 실제 세션이 도착하면 그 때 state 가 authenticated 로 전환.
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

  if (isIamEnabled()) {
    void refreshIamInternal();
  } else {
    iamResolved = true;
    recomputeState();
  }
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
  // Provider가 초기화되기 전에 entity API가 먼저 호출될 수 있어
  // localStorage를 직접 조회해서 early-return을 보강한다.
  const persisted = readPersistedDemoSession();
  if (persisted) {
    demoSession = persisted;
    // subscribers에게 알리기 위해 recompute — 단, 초기화가 안 됐으면
    // firebaseResolved/iamResolved는 그대로 두고 상태만 업데이트한다.
    recomputeState();
    return true;
  }
  return false;
}

export async function signInWithIamSession(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<AuthSessionUser> {
  const response = await postToIam<IamTokenResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
    }),
  });

  if (response.requiresTwoFactor) {
    throw new Error('2단계 인증이 필요한 계정입니다. 아직 이 앱에서는 지원하지 않습니다.');
  }

  const session = buildIamSession(response, {
    email: input.email.trim(),
    displayName: input.displayName ?? null,
  });
  iamResolved = true;
  applyIamSession(session);
  return session.user;
}

export async function signOutCombined() {
  disableDevAdminBypass();
  clearDemoSession();

  if (isIamEnabled()) {
    try {
      await fetch(`${getIamBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: iamSession?.accessToken
          ? {
              Authorization: `Bearer ${iamSession.accessToken}`,
            }
          : undefined,
      });
    } catch {
      // 로그아웃은 best-effort로 처리
    }
  }

  applyIamSession(null);
  iamResolved = true;

  const auth = getFirebaseAuth();
  await firebaseSignOut(auth);
  firebaseResolved = true;
  firebaseUser = null;
  recomputeState();
}

export function clearIamSession() {
  applyIamSession(null);
  iamResolved = true;
  recomputeState();
}

export function hasIamSession() {
  return Boolean(iamSession);
}

export function isIamSessionEnabled() {
  return isIamEnabled();
}

export async function fetchSessionProfile(): Promise<AuthSessionUser | null> {
  if (iamSession && isIamEnabled()) {
    const me = await postToIam<IamMeResponse>('/api/auth/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${iamSession.accessToken}`,
      },
    });

    const nextUser: AuthSessionUser = {
      ...iamSession.user,
      uid: me.id,
      roles: me.roles,
      permissions: me.permissions,
    };
    applyIamSession({
      ...iamSession,
      user: nextUser,
    });
    return nextUser;
  }

  return state.user;
}
