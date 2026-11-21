import type { LocalVerifyReason } from '@/shared/lib/llm-connection/local-endpoint';
import { normalizeRunnerBaseUrl } from '../../model/local-runners';
import type { StatusTone } from './ModelRow';

/** A runner check remembers **which address** it asked, so a result never lands on another. */
export type LocalVerifyState =
  | { kind: 'idle' }
  | { kind: 'checking'; url: string }
  | { kind: 'done'; url: string; reason: LocalVerifyReason; models: string[]; detail: string };

export function sameAddress(a: string, b: string): boolean {
  return normalizeRunnerBaseUrl(a) === normalizeRunnerBaseUrl(b);
}

/** The mark on a runner row's header: only a check of the row's own address recolours it. */
export function localHeaderTone(headerVerify: LocalVerifyState, active: boolean): StatusTone {
  return headerVerify.kind === 'checking'
    ? 'idle'
    : headerVerify.kind === 'done'
      ? headerVerify.reason === 'ok'
        ? 'success'
        : headerVerify.reason === 'no-models'
          ? 'warning'
          : 'danger'
      : active
        ? 'saved'
        : 'idle';
}

/** Is this machine itself — the same decision as Rust's `is_loopback_authority`. */
export function isLoopbackHost(authority: string): boolean {
  const host = authority.startsWith('[')
    ? (authority.slice(1).split(']')[0] ?? '')
    : (authority.split(':')[0] ?? '');
  return host === 'localhost' || host === '::1' || host.startsWith('127.');
}
