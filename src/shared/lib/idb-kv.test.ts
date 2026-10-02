import { afterEach, describe, expect, it, vi } from 'vitest';
import { idbDel, idbGet, idbSet } from './idb-kv';

type Operation = 'get' | 'set' | 'delete';
const invoke = (operation: Operation) => operation === 'get' ? idbGet('key') : operation === 'set' ? idbSet('key', { value: 1 }) : idbDel('key');

function fixture(failure?: 'transaction' | 'request') {
  const ready = Promise.withResolvers<void>();
  const error = new DOMException('Fixture storage error', 'UnknownError');
  const request = { result: { value: 1 }, error, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
  const issue = () => { if (failure === 'request') throw error; return request; };
  const tx = {
    error: null as DOMException | null,
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore: () => ({ get: issue, put: issue, delete: issue }),
  };
  const db = { close: vi.fn(), transaction: vi.fn(() => { ready.resolve(); if (failure === 'transaction') throw error; return tx; }) };
  vi.stubGlobal('indexedDB', { open: () => {
    const open = { result: db, onsuccess: null as (() => void) | null };
    queueMicrotask(() => open.onsuccess?.());
    return open;
  } });
  return { ready: ready.promise, request, tx, db, error };
}
afterEach(() => vi.unstubAllGlobals());

for (const operation of ['get', 'set', 'delete'] as const) {
  describe(`IndexedDB ${operation} lifetime`, () => {
    it('closes a successful connection exactly once and waits for write commit', async () => {
      const test = fixture();
      let settled = false;
      const result = invoke(operation).finally(() => { settled = true; });
      await test.ready;
      test.request.onsuccess?.();
      if (operation !== 'get') expect(settled).toBe(false);
      test.tx.oncomplete?.();
      await expect(result).resolves.toEqual(operation === 'get' ? { value: 1 } : undefined);
      expect(test.db.close).toHaveBeenCalledOnce();
    });

    it('settles an abort without an error event and releases the connection', async () => {
      const test = fixture();
      let settled = false;
      const result = invoke(operation).then(value => ({ value }), error => ({ error })).finally(() => { settled = true; });
      await test.ready;
      test.tx.onabort?.();
      await vi.waitFor(() => expect(settled).toBe(true));
      if (operation === 'get') expect(await result).toMatchObject({ error: { name: 'AbortError' } });
      else expect(await result).toEqual({ value: undefined });
      expect(test.db.close).toHaveBeenCalledOnce();
    });

    it('closes once when an error is followed by abort and retains failure behavior', async () => {
      const test = fixture();
      const result = invoke(operation).then(value => ({ value }), error => ({ error }));
      await test.ready;
      test.tx.error = test.error;
      test.request.onerror?.();
      test.tx.onerror?.();
      test.tx.onabort?.();
      expect(await result).toEqual(operation === 'get' ? { error: test.error } : { value: undefined });
      expect(test.db.close).toHaveBeenCalledOnce();
    });

    it.each(['transaction', 'request'] as const)('closes after synchronous %s setup failure', async (failure) => {
      const test = fixture(failure);
      const result = invoke(operation).then(value => ({ value }), error => ({ error }));
      expect(await result).toEqual(operation === 'get' ? { error: test.error } : { value: undefined });
      expect(test.db.close).toHaveBeenCalledOnce();
    });
  });
}

it('keeps unavailable IndexedDB a safe no-op', async () => {
  vi.stubGlobal('indexedDB', undefined);
  await expect(idbGet('key')).resolves.toBeUndefined();
  await expect(idbSet('key', 'value')).resolves.toBeUndefined();
  await expect(idbDel('key')).resolves.toBeUndefined();
});
