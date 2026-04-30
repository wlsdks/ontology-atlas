'use client';

import { type ReactNode, useEffect } from 'react';
import { getFirebaseApp } from '@/shared/api';

interface Props {
  children: ReactNode;
}

/**
 * Firebase SDK 의 "Could not reach Cloud Firestore backend" 경고는 SDK
 * 자체 heartbeat probe 가 10초 안에 못 응답받으면 찍고 자동으로 offline
 * mode 로 전환하는 동작. 데모 사용자는 실 Firestore 를 쓰지 않고, 실
 * 사용자도 일시적 네트워크 흔들림에서 자연 복구되므로 UX 노이즈.
 *
 * **module top-level 에서** console.error 를 1회 patch. React effect
 * 가 뛰기 전에 Firebase SDK 가 probe 를 쏠 수 있어, useEffect 기반
 * 패치는 race 로 첫 error 를 놓친다. import 즉시 실행되는 이 IIFE 는
 * 모든 후속 console.error 를 감싸 특정 signature 만 swallow.
 */
const FIRESTORE_NOISE_SIGNATURES = [
  'Could not reach Cloud Firestore backend',
  'Connection failed',
  '@firebase/firestore',
];

function argMatchesSignature(arg: unknown, signature: string): boolean {
  if (typeof arg === 'string') return arg.includes(signature);
  if (arg instanceof Error) return arg.message.includes(signature) || (arg.stack?.includes(signature) ?? false);
  if (arg && typeof arg === 'object') {
    try {
      return JSON.stringify(arg).includes(signature);
    } catch {
      return false;
    }
  }
  return false;
}

function shouldSwallow(args: unknown[]): boolean {
  return args.some((a) => FIRESTORE_NOISE_SIGNATURES.some((sig) => argMatchesSignature(a, sig)));
}

if (typeof window !== 'undefined' && !(window as unknown as { __firebaseOfflinePatched?: boolean }).__firebaseOfflinePatched) {
  (window as unknown as { __firebaseOfflinePatched: boolean }).__firebaseOfflinePatched = true;
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    if (shouldSwallow(args)) return;
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    if (shouldSwallow(args)) return;
    originalWarn(...args);
  };

  // Next.js dev overlay가 unhandledrejection / window.error 로도 노이즈를 잡아
  // 띄우므로, Firestore offline 계열은 dev overlay가 가로채기 전에 취소한다.
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const reason = event.reason;
      if (shouldSwallow([reason])) {
        event.preventDefault();
      }
    },
    true,
  );
  window.addEventListener(
    'error',
    (event) => {
      if (shouldSwallow([event.message, event.error])) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
}

export function FirebaseProvider({ children }: Props) {
  useEffect(() => {
    try {
      getFirebaseApp();
    } catch (err) {
      console.warn('[FirebaseProvider] 초기화 실패:', err);
    }
  }, []);

  return <>{children}</>;
}
