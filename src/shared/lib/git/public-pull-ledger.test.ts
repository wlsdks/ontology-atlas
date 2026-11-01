import { afterEach, expect, it } from 'vitest';
import { canStorePublicPullScope, clearPublicPullLedger, getPublicPullSession, invalidatePublicPullCursor, publicPullScope, savePublicPullPage } from './public-pull-ledger';
import type { PublicPullInventory, PublicPullVersion } from './tauri-pr-inventory';

const record = (number: number): PublicPullVersion => ({ number, digest: String(number), body: 'body', bodyPresent: true, title: 'title', url: 'https://github.com/a/b/pull/1', status: 'open', updatedAt: '2026-01-01', fetchedAt: '2026-01-02' });
const page = (versions: PublicPullVersion[]) => ({ versions, status: 'partial', conflicts: [], omitted: [], unlistedOmissions: 0, cursor: 'next', canContinue: true }) as unknown as PublicPullInventory;
afterEach(clearPublicPullLedger);

it('retains separate attributed scopes while bounding all stored records together', () => {
  const a = publicPullScope('/repo', 'head', 'first', 'a/b');
  const b = publicPullScope('/repo', 'head', 'second', 'a/b');
  const first = savePublicPullPage(a, page(Array.from({ length: 399 }, (_, index) => record(index + 1))));
  const second = savePublicPullPage(b, page([record(400), record(401)]));
  expect(first?.versions).toHaveLength(399);
  expect(second?.versions).toHaveLength(1);
  expect(second?.omittedForSessionLimit).toBe(1);
  expect(getPublicPullSession(a).versions).toHaveLength(399);
});

it('bounds empty scopes too and refuses a new scope rather than dropping an old one', () => {
  for (let i = 0; i < 32; i++) expect(savePublicPullPage(String(i), page([]))).not.toBeNull();
  expect(canStorePublicPullScope('overflow')).toBe(false);
  expect(savePublicPullPage('overflow', page([]))).toBeNull();
  expect(getPublicPullSession('0').report?.cursor).toBe('next');
});

it('shares the byte budget between different scopes as well as the record budget', () => {
  const body = 'a'.repeat(500_000);
  const first = savePublicPullPage('first', page(Array.from({ length: 17 }, (_, i) => ({ ...record(i + 1), body }))));
  const second = savePublicPullPage('second', page(Array.from({ length: 17 }, (_, i) => ({ ...record(i + 30), body }))));
  expect(first?.retainedBytes).toBeGreaterThan(8_000_000);
  expect(second?.omittedForSessionLimit).toBeGreaterThan(0);
  expect((first?.retainedBytes ?? 0) + (second?.retainedBytes ?? 0)).toBeLessThanOrEqual(16 * 1024 * 1024);
});

it('keeps previous originals but retires a cursor consumed by an interrupted scope', () => {
  savePublicPullPage('first', page([record(1)]));
  invalidatePublicPullCursor('first');
  expect(getPublicPullSession('first')).toMatchObject({ cursorNeedsRestart: true, versions: [{ number: 1 }] });
});
