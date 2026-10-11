import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

const IME_PROCESS_KEY_CODE = 229;
const WEBKIT_COMMIT_KEYDOWN_WINDOW_MS = 500;

let lastCompositionEnd: { target: EventTarget | null; timeStamp: number } | null = null;
const webkitCommitKeydowns = new WeakSet<Event>();

function isWebKit(): boolean {
  return navigator.vendor.startsWith('Apple');
}

function rememberCompositionEnd(event: Event): void {
  lastCompositionEnd = { target: event.target, timeStamp: event.timeStamp };
}

function claimKeydownAfterCompositionEnd(event: Event): void {
  const ended = lastCompositionEnd;
  if (ended === null) return;
  lastCompositionEnd = null;
  const sameField = ended.target === event.target;
  const withinWindow = Math.abs(event.timeStamp - ended.timeStamp) < WEBKIT_COMMIT_KEYDOWN_WINDOW_MS;
  if (sameField && withinWindow && isWebKit()) webkitCommitKeydowns.add(event);
}

if (typeof window !== 'undefined') {
  window.addEventListener('compositionend', rememberCompositionEnd, true);
  window.addEventListener('keydown', claimKeydownAfterCompositionEnd, true);
}

export function isImeComposing(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const native = 'nativeEvent' in event ? event.nativeEvent : event;
  return (
    native.isComposing ||
    native.keyCode === IME_PROCESS_KEY_CODE ||
    webkitCommitKeydowns.has(native)
  );
}
