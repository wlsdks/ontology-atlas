// A GPU Chromium session over the static export with a generated vault in OPFS, opened through a
// stubbed folder picker. The OPFS copy is written once per vault into a persistent profile.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { listVaultFiles, PERF_WORK } from './vaults.mjs';

const ROOT = new URL('../../..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'package.json'));
const PROBE_SOURCE = readFileSync(new URL('./page-probe.js', import.meta.url), 'utf8');

export async function startStaticServer(dir, port) {
  const server = spawn(process.execPath, [join(ROOT, 'scripts/web/serve-static-export.mjs'), `--port=${port}`, `--dir=${dir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const origin = `http://localhost:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`the static server exited (${server.exitCode}); is port ${port} free?`);
    try {
      if ((await fetch(`${origin}/en/`)).ok) return { origin, stop: () => server.kill('SIGTERM'), pid: server.pid };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  server.kill('SIGTERM');
  throw new Error(`the static server did not answer on ${origin}`);
}

/** Writes every vault file into OPFS from a worker, 1,000 files per round trip. */
async function fillOpfs(context, origin, vault) {
  const folder = `${vault.shape}-${vault.files}`;
  const page = await context.newPage();
  await page.goto(`${origin}/en/`);
  const filled = await page.evaluate(async (name) => {
    try {
      const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name);
      await dir.getFileHandle('.perf-complete');
      return true;
    } catch {
      return false;
    }
  }, folder);
  if (!filled) {
    const files = listVaultFiles(vault.dir);
    const chunks = [];
    for (let at = 0; at < files.length; at += 1000) {
      chunks.push(JSON.stringify(files.slice(at, at + 1000).map((f) => [f, readFileSync(join(vault.dir, f), 'utf8')])));
    }
    await page.route('**/__vault/chunk-*', (route) => {
      const n = Number(route.request().url().match(/chunk-(\d+)/)[1]);
      route.fulfill({ status: 200, contentType: 'application/json', body: chunks[n] });
    });
    await page.evaluate(async ({ name, count }) => {
      const source = `
        const enc = new TextEncoder();
        onmessage = async (e) => {
          const { name, files, done } = e.data;
          const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true });
          const dirs = new Map([['', dir]]);
          const dirFor = async (parts) => {
            let key = '';
            let cursor = dir;
            for (const part of parts) {
              key = key ? key + '/' + part : part;
              let next = dirs.get(key);
              if (!next) { next = await cursor.getDirectoryHandle(part, { create: true }); dirs.set(key, next); }
              cursor = next;
            }
            return cursor;
          };
          for (const [path, body] of files) {
            const parts = path.split('/');
            const file = parts.pop();
            const handle = await (await dirFor(parts)).getFileHandle(file, { create: true });
            const access = await handle.createSyncAccessHandle();
            access.truncate(0);
            access.write(enc.encode(body), { at: 0 });
            access.flush();
            access.close();
          }
          if (done) (await dir.getFileHandle('.perf-complete', { create: true }));
          postMessage('ok');
        };`;
      const worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      for (let n = 0; n < count; n += 1) {
        const files = await (await fetch(`/__vault/chunk-${n}`)).json();
        await new Promise((resolve) => {
          worker.onmessage = resolve;
          worker.postMessage({ name, files, done: n === count - 1 });
        });
      }
      worker.terminate();
    }, { name: folder, count: chunks.length });
  }
  // A fresh session each run: forget the stored handle and preferences, keep OPFS.
  await page.evaluate(async () => {
    for (const db of await indexedDB.databases()) if (db.name) indexedDB.deleteDatabase(db.name);
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.close();
  return { folder, filled: !filled };
}

/** A page with the probe and the picker stub installed, ready to open `vault`. */
export async function openWebSession({ origin, vault }) {
  const { chromium } = require('@playwright/test');
  const profile = join(PERF_WORK, 'chromium-profiles', `${vault.shape}-${vault.files}`);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1512, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    args: ['--enable-precise-memory-info'],
  });
  const { folder, filled } = await fillOpfs(context, origin, vault);
  const page = await context.newPage();
  await page.addInitScript(PROBE_SOURCE);
  await page.addInitScript((name) => {
    const grant = async () => 'granted';
    const patch = (handle) => {
      handle.queryPermission ??= grant;
      handle.requestPermission ??= grant;
      const inner = handle.getDirectoryHandle.bind(handle);
      handle.getDirectoryHandle = async (n, o) => patch(await inner(n, o));
      return handle;
    };
    window.showDirectoryPicker = async () => {
      window.__perfProbe?.mark('picked');
      return patch(await (await navigator.storage.getDirectory()).getDirectoryHandle(name));
    };
  }, folder);
  return { context, page, profile, filledOpfs: filled };
}
