import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVaultLoadProgressStore } from './vault-load-progress';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('vault load progress store', () => {
  it('tells listeners at once when reading starts and ends, and at most four times a second between', () => {
    const store = createVaultLoadProgressStore();
    const seen: Array<string | null> = [];
    store.subscribe(() => {
      const progress = store.get();
      seen.push(progress ? `${progress.read}/${progress.total}` : null);
    });

    store.set({ read: 1, total: 900 });
    for (let read = 2; read <= 600; read += 1) store.set({ read, total: 900 });
    expect(seen).toEqual(['1/900']);
    vi.advanceTimersByTime(250);
    expect(seen).toEqual(['1/900', '600/900']);
    store.set({ read: 900, total: 900 });
    store.set(null);
    expect(seen).toEqual(['1/900', '600/900', null]);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual(['1/900', '600/900', null]);
  });
});
