/**
 * What the shell tells the screen about the adapter before it speaks: a first-run download in
 * flight, or the permission gate that could not be raised.
 */
export type AdapterNotice =
  | { kind: 'download-progress'; megabytes: number | null }
  | { kind: 'download-done' }
  | { kind: 'first-run-download' }
  | { kind: 'gate-off' }
  | { kind: 'other' };

const DOWNLOAD_PROGRESS_PREFIX = 'npx-download-progress:';

/**
 * `npx-first-run-download[…]` starts a first download; `npx-download-progress:<mb>` arrives every
 * second; `npx-download-done` returns to an ordinary "starting".
 */
export function readAdapterNotice(message: string): AdapterNotice {
  if (message.startsWith(DOWNLOAD_PROGRESS_PREFIX)) {
    const megabytes = Number(message.slice(DOWNLOAD_PROGRESS_PREFIX.length));
    return { kind: 'download-progress', megabytes: Number.isFinite(megabytes) ? megabytes : null };
  }
  if (message.startsWith('npx-download-done')) return { kind: 'download-done' };
  if (message.startsWith('npx-first-run-download')) return { kind: 'first-run-download' };
  if (message.startsWith('gate-off')) return { kind: 'gate-off' };
  return { kind: 'other' };
}
