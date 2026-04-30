import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { env } from '@/shared/config';

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Lazy 싱글톤.
// 모듈 로드 시점이 아닌 첫 접근 시점에 초기화 → static export 빌드 시
// 환경변수 없어도 import 자체가 실패하지 않음. 실제 Firebase 호출 시점에
// apiKey 검증이 일어난다.
let _app: FirebaseApp | null = null;
let _firestore: Firestore | null = null;
let _storage: FirebaseStorage | null = null;
let _auth: Auth | null = null;
let _functions: Functions | null = null;
let _firestoreEmulatorConnected = false;
let _functionsEmulatorConnected = false;
let _authEmulatorConnected = false;

/**
 * 런타임 safeguard — 환경변수가 localhost emulator 를 가리키지만 실행 중인
 * 브라우저가 프로덕션 도메인이면 emulator 연결을 무시한다. `.env.local` 의
 * emulator 설정이 `pnpm build` 에 baked 된 채 프로덕션 배포된 과거 회귀
 * (smoke 발견) 같은 케이스를 마지막에서 막는다.
 *
 * 원칙: 개발자가 `.env.development.local` 로 분리해 빌드에서 제외하는 게
 * 정도지만, 그 실수가 반복돼도 프로덕션 사용자가 localhost 에 붙지 않도록
 * runtime 방어 1겹 추가.
 */
function isRunningOnProductionOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && !hostname.endsWith('.local');
}

function shouldUseFirestoreEmulator() {
  if (isRunningOnProductionOrigin()) return false;
  return env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1' && Boolean(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST);
}

function shouldUseFunctionsEmulator() {
  if (isRunningOnProductionOrigin()) return false;
  return env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1' && Boolean(env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST);
}

function shouldUseAuthEmulator() {
  if (isRunningOnProductionOrigin()) return false;
  return env.NEXT_PUBLIC_FIREBASE_USE_EMULATORS === '1' && Boolean(env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST);
}

function getHostAndPort(hostValue: string) {
  const [host, portText] = hostValue.split(':');
  return {
    host,
    port: Number(portText || '8080'),
  };
}

export function getFirebaseApp(): FirebaseApp {
  if (_app) return _app;
  const existing = getApps()[0];
  _app = existing ?? initializeApp(firebaseConfig);
  return _app;
}

export function getDb(): Firestore {
  if (!_firestore) {
    _firestore = getFirestore(getFirebaseApp());
    if (shouldUseFirestoreEmulator() && !_firestoreEmulatorConnected) {
      const { host, port } = getHostAndPort(env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080');
      connectFirestoreEmulator(_firestore, host, port);
      _firestoreEmulatorConnected = true;
    }
  }
  return _firestore;
}

export function getBucket(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getFirebaseApp());
  return _storage;
}

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    if (shouldUseAuthEmulator() && !_authEmulatorConnected) {
      connectAuthEmulator(
        _auth,
        `http://${env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:19099"}`,
        { disableWarnings: true },
      );
      _authEmulatorConnected = true;
    }
  }
  return _auth;
}

export function getFirebaseFunctions(): Functions {
  if (!_functions) {
    _functions = getFunctions(
      getFirebaseApp(),
      env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "asia-northeast3",
    );
    if (shouldUseFunctionsEmulator() && !_functionsEmulatorConnected) {
      const { host, port } = getHostAndPort(
        env.NEXT_PUBLIC_FUNCTIONS_EMULATOR_HOST ?? "127.0.0.1:5001",
      );
      connectFunctionsEmulator(_functions, host, port);
      _functionsEmulatorConnected = true;
    }
  }
  return _functions;
}
