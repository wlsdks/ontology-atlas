/**
 * Firestore offline / 연결 실패 noise 를 콘솔에서 swallow.
 *
 * Firebase SDK 의 "Could not reach Cloud Firestore backend" 경고는 SDK
 * 자체 heartbeat probe 가 10초 안에 못 응답받으면 찍고 자동으로 offline
 * mode 로 전환하는 동작. 데모 사용자는 실 Firestore 를 쓰지 않고, 실
 * 사용자도 일시적 네트워크 흔들림에서 자연 복구되므로 UX 노이즈.
 *
 * 이 모듈은 firebase 의존이 0 — root layout 에서 side-effect import 만
 * 해도 콘솔 패치가 install 된다. firebase JS 자체는 별도 dynamic import
 * 경로를 통해서만 번들에 들어와 local-first 첫 paint 를 가볍게 유지.
 */

const FIRESTORE_NOISE_SIGNATURES = [
  'Could not reach Cloud Firestore backend',
  'Connection failed',
  '@firebase/firestore',
];

function argMatchesSignature(arg: unknown, signature: string): boolean {
  if (typeof arg === 'string') return arg.includes(signature);
  if (arg instanceof Error) {
    return arg.message.includes(signature) || (arg.stack?.includes(signature) ?? false);
  }
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

if (
  typeof window !== 'undefined' &&
  !(window as unknown as { __firebaseOfflinePatched?: boolean }).__firebaseOfflinePatched
) {
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
