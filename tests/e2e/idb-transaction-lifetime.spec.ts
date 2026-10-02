import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { test, expect, type Page } from '@playwright/test';
import type * as Kv from '../../src/shared/lib/idb-kv';
import type * as Handles from '../../src/entities/local-fs-handle/api/store';

type Fixture = { kv: typeof Kv; handles: typeof Handles; done: boolean; aborted: number; settled: Promise<void>[]; opened: Set<IDBDatabase>; closes: Map<IDBDatabase, number> };
declare global { interface Window { idbFixture: Fixture } }
const compile = (path: string) => ts.transpileModule(readFileSync(resolve(path), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const kvSource = compile('src/shared/lib/idb-kv.ts');
const handleSource = compile('src/entities/local-fs-handle/api/store.ts');

async function install(page: Page) {
  await page.route('**/idb-lifetime-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Storage fixture</title>' }));
  await page.goto('/idb-lifetime-fixture');
  await page.addScriptTag({ content: `(() => {
    const kv = {}; (function(exports) { ${kvSource} })(kv);
    const handles = {}; (function(exports, require) { ${handleSource} })(handles, name => {
      if (name === '@/shared/lib/idb-kv') return kv;
      if (name === '@/shared/lib/tauri-vault-fs') return { getTauriVaultRootPath: () => null, isTauriVaultRuntime: () => false };
      throw new Error('Unexpected fixture import: ' + name);
    });
    window.idbFixture = { kv, handles, done: false, aborted: 0, settled: [], opened: new Set(), closes: new Map() };
  })();` });
  await page.evaluate(() => {
    const fixture = window.idbFixture;
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name, version) => {
      const request = open(name, version);
      request.addEventListener('success', () => fixture.opened.add(request.result));
      return request;
    };
    const close = IDBDatabase.prototype.close;
    IDBDatabase.prototype.close = function () {
      fixture.closes.set(this, (fixture.closes.get(this) ?? 0) + 1);
      close.call(this);
    };
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = transaction.apply(this, args);
      fixture.settled.push(new Promise<void>(resolve => {
        tx.addEventListener('complete', () => resolve(), { once: true });
        tx.addEventListener('abort', () => { fixture.aborted++; resolve(); }, { once: true });
      }));
      return tx;
    };
  });
}

async function disposal(page: Page) {
  return page.evaluate(async () => {
    const fixture = window.idbFixture;
    await Promise.all(fixture.settled);
    const unclosed = [...fixture.opened].filter(db => !fixture.closes.has(db)).length;
    const duplicateCloses = [...fixture.closes.values()].filter(count => count !== 1).length;
    const blockedDeletion = await new Promise<boolean>((resolve, reject) => {
      let blocked = false;
      const request = indexedDB.deleteDatabase('demo-kv');
      request.onblocked = () => { blocked = true; for (const db of fixture.opened) db.close(); };
      request.onsuccess = () => resolve(blocked);
      request.onerror = () => reject(request.error);
    });
    return { unclosed, duplicateCloses, blockedDeletion };
  });
}

async function abortNextPut(page: Page, key: string) {
  await page.evaluate(key => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, targetKey) {
      const request = put.call(this, value, targetKey);
      if (targetKey === key) {
        IDBObjectStore.prototype.put = put;
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
      }
      return request;
    };
  }, key);
}

test('failed structured cloning closes connections and preserves subsequent storage', async ({ page }) => {
  await install(page);
  const result = await page.evaluate(async () => {
    const kv = window.idbFixture.kv;
    for (let cycle = 0; cycle < 3; cycle++) await kv.idbSet('uncloneable', () => undefined);
    await kv.idbSet('valid', { name: '한글 폴더' });
    const saved = await kv.idbGet('valid');
    await kv.idbDel('valid');
    return { saved, absent: await kv.idbGet('valid') };
  });
  expect(result).toEqual({ saved: { name: '한글 폴더' }, absent: undefined });
  expect(await disposal(page)).toEqual({ unclosed: 0, duplicateCloses: 0, blockedDeletion: false });
});

test('an abort after request success settles the write and rolls back its value', async ({ page }) => {
  await install(page);
  await abortNextPut(page, 'aborted');
  await page.evaluate(() => {
    void window.idbFixture.kv.idbSet('aborted', 'not committed').then(() => { window.idbFixture.done = true; });
  });
  await expect.poll(() => page.evaluate(() => window.idbFixture.aborted)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.idbFixture.done)).toBe(true);
  expect(await page.evaluate(() => window.idbFixture.kv.idbGet('aborted'))).toBeUndefined();
  expect(await disposal(page)).toEqual({ unclosed: 0, duplicateCloses: 0, blockedDeletion: false });
});

test('a real aborted preference write cannot strand later folder records in the queue', async ({ page }) => {
  await install(page);
  await abortNextPut(page, 'docs-vault:fs-handle:current');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const first = await root.getDirectoryHandle('first', { create: true });
    const second = await root.getDirectoryHandle('second', { create: true });
    const store = window.idbFixture.handles;
    const write = (handle: FileSystemDirectoryHandle, time: number) => store.putLocalFsHandle({ id: 'current', handle, name: handle.name, createdAt: time, lastAccessedAt: time });
    void Promise.all([write(first, 1), write(second, 2)]).then(() => { window.idbFixture.done = true; });
  });
  await expect.poll(() => page.evaluate(() => window.idbFixture.aborted)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.idbFixture.done)).toBe(true);
  const result = await page.evaluate(async () => ({
    current: (await window.idbFixture.handles.getLocalFsHandle())?.name,
    recents: (await window.idbFixture.handles.listRecentLocalFsHandles()).map(record => record.name),
  }));
  expect(result).toEqual({ current: 'second', recents: ['second', 'first'] });
  expect(await disposal(page)).toEqual({ unclosed: 0, duplicateCloses: 0, blockedDeletion: false });
});
