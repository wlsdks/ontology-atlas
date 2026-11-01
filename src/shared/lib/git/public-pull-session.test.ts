import { expect, it } from 'vitest';
import { appendPublicPullPage, emptyPublicPullSession, publicPullConflicts } from './public-pull-session';
import type { PublicPullInventory, PublicPullVersion } from './tauri-pr-inventory';

const version = (number: number, digest: string, body = ''): PublicPullVersion => ({
  number, digest, body, bodyPresent: true, title: 'title', url: 'https://github.com/a/b/pull/1',
  status: 'open', updatedAt: '2026-01-01T00:00:00Z', fetchedAt: '2026-01-02T00:00:00Z',
});
const page = (versions: PublicPullVersion[]) => ({ versions, status: 'partial', canContinue: true, conflicts: [], omitted: [], unlistedOmissions: 0 }) as unknown as PublicPullInventory;

it('keeps distinct versions while deduplicating an explicitly restarted page', () => {
  const first = appendPublicPullPage(emptyPublicPullSession(), page([version(1, 'a'), version(2, 'b')]));
  const next = appendPublicPullPage(first, page([version(1, 'a'), version(1, 'c')]));
  expect(next.versions.map((item) => item.digest)).toEqual(['a', 'b', 'c']);
  expect(next.retainedBytes).toBeGreaterThan(first.retainedBytes);
  expect(next.report?.versions).toEqual([]);
  expect([...publicPullConflicts(next)]).toEqual([1]);
});

it('preserves a conflict reported by the native scan even when an original was omitted', () => {
  const result = appendPublicPullPage(emptyPublicPullSession(), { ...page([version(1, 'a')]), conflicts: [1], unlistedOmissions: 1 });
  const restarted = appendPublicPullPage(result, page([]));
  expect(publicPullConflicts(restarted).has(1)).toBe(true);
  expect(restarted.hadNativeOmissions).toBe(true);
});

it('bounds retained data across pages and does not silently continue after a session omission', () => {
  const initial = appendPublicPullPage(emptyPublicPullSession(), page(Array.from({ length: 400 }, (_, index) => version(index + 1, String(index)))));
  const limited = appendPublicPullPage(initial, page([version(401, 'over')]));
  expect(limited.versions).toHaveLength(400);
  expect(limited.omittedForSessionLimit).toBe(1);
  expect(limited.sessionOmissions).toEqual([{ number: 401, digest: 'over' }]);
  expect(appendPublicPullPage(limited, page([version(402, 'another')]))).toBe(limited);
});

it('bounds identified session omissions and marks overflow', () => {
  const omitted = Array.from({ length: 401 }, (_, index) => version(index + 1, String(index)));
  const limited = appendPublicPullPage(emptyPublicPullSession(), page(omitted), { versions: 0, bytes: 0 });
  expect(limited.omittedForSessionLimit).toBe(401);
  expect(limited.sessionOmissions).toHaveLength(400);
  expect(limited.sessionOmissionsUnlisted).toBe(true);
});

it('counts UTF-8 bytes rather than characters when retaining originals', () => {
  const result = appendPublicPullPage(emptyPublicPullSession(), page([version(1, 'large', '한'.repeat(6 * 1024 * 1024))]));
  expect(result.versions).toEqual([]);
  expect(result.omittedForSessionLimit).toBe(1);
});

it('bounds accumulated conflict metadata across explicitly restarted scans', () => {
  const first = appendPublicPullPage(emptyPublicPullSession(), { ...page([]), conflicts: Array.from({ length: 400 }, (_, index) => index + 1) });
  const next = appendPublicPullPage(first, { ...page([]), conflicts: [401] });
  expect(next.conflicts).toHaveLength(400);
  expect(next.conflictOverflow).toBe(true);
});


it('retains identified omitted versions across restarted reads and reports overflow', () => {
  const omitted = { number: 42, digest: 'a'.repeat(64), updatedAt: '2026-01-01T00:00:00Z', reason: 'record-oversized' };
  const first = appendPublicPullPage(emptyPublicPullSession(), { ...page([]), omitted: [omitted], unlistedOmissions: 2 });
  const restarted = appendPublicPullPage(first, page([]));
  expect(restarted.nativeOmissions).toEqual([omitted]);
  expect(restarted.nativeOmissionsUnlisted).toBe(true);
});
