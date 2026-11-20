// @vitest-environment node
/**
 * The installed app's reopen from the derived index's rows, against a build from the files. Rows
 * go through the crate itself: `vault-rows-bridge` answers the same two commands the app has,
 * with the same decode and row code. `pnpm perf:vault-open` builds it and sets
 * `VAULT_ROWS_BRIDGE`; without a built bridge (the Linux perf lane has no Rust) the file skips.
 * File reads stand in for the app's `read_vault_text_files`, without the bridge's copy.
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { encodeVaultTextFrames } from '../../../../../tests/helpers/vault-text-frames';

const transport = vi.hoisted(() => ({
  invoke: (_command: string, _args?: unknown): Promise<unknown> => Promise.reject(new Error('no bridge')),
}));

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: (command: string, args?: unknown) => transport.invoke(command, args),
}));

const storage = new Map<string, string>();
Object.assign(globalThis, {
  window: Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, String(value)),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
    },
  }),
});

const { buildLocalManifestWithEntries, vaultRowWritesSettled } = await import('./build-local-manifest');
const { vaultIndexPreference } = await import('@/shared/lib/vault-folder/tauri-vault-index');

const BRIDGE = process.env.VAULT_ROWS_BRIDGE ?? '';
const REPORT = process.env.VAULT_OPEN_REPORT ?? '';
const ROOT = resolve(__dirname, '../../../../..');
const MB = 1024 * 1024;
const NS_PER_MS = BigInt(1_000_000);

interface Vault {
  dir: string;
  files: number;
  shape: string;
  indexDir: string;
}

/** Frames to and from one bridge process, one request at a time. */
class RowsBridge {
  private readonly child: ChildProcessWithoutNullStreams;
  /** Unread stdout, joined only once a whole frame has arrived. */
  private chunks: Buffer[] = [];
  private buffered = 0;
  private deliver: ((frame: { ok: boolean; body: Buffer }) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Answers of `get`, counted after a timed build so counting costs it nothing. */
  answers: Buffer[] = [];
  calls = { get: 0, put: 0 };

  constructor(indexDir: string) {
    this.child = spawn(BRIDGE, [], { env: { ...process.env, OATLAS_INDEX_DIR: indexDir }, stdio: 'pipe' });
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.buffered += chunk.length;
      this.flush();
    });
  }

  private flush() {
    if (!this.deliver || this.chunks.length === 0) return;
    let head = this.chunks[0];
    let newline = head.indexOf(10);
    if (newline < 0) {
      head = Buffer.concat(this.chunks);
      this.chunks = [head];
      newline = head.indexOf(10);
      if (newline < 0) return;
    }
    const [status, length] = head.subarray(0, newline).toString().split(' ');
    const end = newline + 1 + Number(length);
    if (this.buffered < end) return;
    const all = this.chunks.length === 1 ? head : Buffer.concat(this.chunks);
    const rest = all.subarray(end);
    this.chunks = rest.length > 0 ? [rest] : [];
    this.buffered = rest.length;
    const deliver = this.deliver;
    this.deliver = null;
    deliver({ ok: status === 'ok', body: all.subarray(newline + 1, end) });
  }

  /** Values handed back from rows since the last call. */
  takeHits(): number {
    const hits = this.answers.reduce((sum, answer) => sum + (JSON.parse(answer.toString()) as { hits: unknown[] }).hits.length, 0);
    this.answers = [];
    return hits;
  }

  request(command: string, body: Uint8Array): Promise<Buffer> {
    const next = this.queue.then(
      () =>
        new Promise<Buffer>((resolveFrame, reject) => {
          this.deliver = ({ ok, body: answer }) => (ok ? resolveFrame(answer) : reject(new Error(answer.toString())));
          this.child.stdin.write(`${command} ${body.byteLength}\n`);
          this.child.stdin.write(body);
          this.flush();
        }),
    );
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The app's commands: rows through the crate, text reads from the files. */
  async invoke(command: string, args: unknown): Promise<unknown> {
    if (command === 'vault_index_rows_get') {
      this.calls.get += 1;
      const answer = await this.request('get', args as Uint8Array);
      this.answers.push(answer);
      return answer.buffer.slice(answer.byteOffset, answer.byteOffset + answer.byteLength);
    }
    if (command === 'vault_index_rows_put') {
      this.calls.put += 1;
      return JSON.parse((await this.request('put', args as Uint8Array)).toString());
    }
    if (command === 'read_vault_text_files') {
      const { rootPath, relativePaths } = args as { rootPath: string; relativePaths: string[] };
      return encodeVaultTextFrames(relativePaths.map((relativePath) => readText(rootPath, relativePath)));
    }
    if (command === 'read_vault_text_file') {
      const { rootPath, relativePath } = args as { rootPath: string; relativePath: string };
      return readText(rootPath, relativePath);
    }
    throw new Error(`the bridge stand-in has no ${command}`);
  }

  async deleteIndex(root: string): Promise<void> {
    await this.request('delete', new TextEncoder().encode(root));
  }

  async size(root: string): Promise<{ rowsBytes: number; folderBytes: number }> {
    return JSON.parse((await this.request('size', new TextEncoder().encode(root))).toString());
  }

  close() {
    this.child.stdin.end();
    this.child.kill();
  }
}

/** What `read_vault_text_files` answers: the text and the modified time in whole milliseconds. */
function readText(rootPath: string, relativePath: string) {
  try {
    const path = join(rootPath, relativePath);
    const lastModified = Number(statSync(path, { bigint: true }).mtimeNs / NS_PER_MS);
    return { relativePath, text: readFileSync(path, 'utf8'), lastModified, error: null };
  } catch (error) {
    return { relativePath, text: null, lastModified: null, error: String(error) };
  }
}

/** A FileSystemDirectoryHandle over the folder; the root carries the app's `rootPath`. */
function dirHandle(path: string, name: string, rootPath?: string): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    ...(rootPath ? { rootPath } : {}),
    entries: async function* () {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        const child = join(path, entry.name);
        if (entry.isDirectory()) yield [entry.name, dirHandle(child, entry.name)];
        else if (entry.isFile()) {
          yield [
            entry.name,
            {
              kind: 'file',
              name: entry.name,
              getFile: async () => {
                const stat = statSync(child, { bigint: true });
                return {
                  lastModified: Number(stat.mtimeNs / NS_PER_MS),
                  size: Number(stat.size),
                  text: async () => readFileSync(child, 'utf8'),
                };
              },
            },
          ];
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

function markdownFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return markdownFiles(join(dir, entry.name), relative);
    return entry.name.endsWith('.md') ? [relative] : [];
  });
}

/** Rows are refused for files modified within two seconds; a vault generated just now is dated back. */
function dateBack(dir: string) {
  const then = new Date(Date.now() - 60_000);
  for (const file of markdownFiles(dir)) utimesSync(join(dir, file), then, then);
}

function manifestJson(manifest: unknown): string {
  return JSON.stringify({ ...(manifest as Record<string, unknown>), generatedAt: '' });
}

async function build(dir: string) {
  const result = await buildLocalManifestWithEntries(dirHandle(dir, 'vault', dir));
  await vaultRowWritesSettled();
  return result;
}

const vaults: Vault[] = JSON.parse(process.env.VAULT_OPEN_VAULTS ?? '[]');
const work = BRIDGE ? mkdtempSync(join(tmpdir(), 'atlas-rows-equality-')) : '';

describe.skipIf(!BRIDGE)('reopen from the derived index rows', () => {
  let equalityVault = vaults.find((vault) => vault.files === 10000)?.dir ?? '';

  beforeAll(() => {
    if (equalityVault) return;
    equalityVault = join(work, 'key-10000');
    const generated = spawnSync(process.execPath, [join(ROOT, 'scripts/perf/gen-scale-vault.mjs'), equalityVault, '10000', 'key']);
    expect(generated.status).toBe(0);
    dateBack(equalityVault);
  });

  afterAll(() => {
    if (work) rmSync(work, { recursive: true, force: true });
  });

  it('a_manifest_from_rows_equals_a_manifest_from_files', async () => {
    const bridge = new RowsBridge(join(work, 'equality-index'));
    transport.invoke = (command, args) => bridge.invoke(command, args);
    try {
      const markdown = markdownFiles(equalityVault).length;

      vaultIndexPreference.write('off');
      const fromFiles = manifestJson((await build(equalityVault)).build.manifest);
      expect(bridge.calls.get + bridge.calls.put).toBe(0);
      vaultIndexPreference.write('on');

      const counted = async () => {
        const puts = bridge.calls.put;
        const json = manifestJson((await build(equalityVault)).build.manifest);
        return { json, hits: bridge.takeHits(), puts: bridge.calls.put - puts };
      };
      const cold = await counted();
      const warm = await counted();
      await bridge.deleteIndex(equalityVault);
      const deleted = await counted();
      const warmAgain = await counted();

      expect({ cold: cold.hits, warm: warm.hits, deleted: deleted.hits, warmAgain: warmAgain.hits }).toEqual({
        cold: 0,
        warm: markdown,
        deleted: 0,
        warmAgain: markdown,
      });
      expect(cold.puts).toBeGreaterThan(0);
      for (const [name, json] of Object.entries({ cold, warm, deleted, warmAgain })) {
        expect(json.json === fromFiles, `${name} manifest equals the one from files`).toBe(true);
      }
    } finally {
      bridge.close();
    }
  });

  setFlagsFromString('--expose-gc');
  const gc = runInNewContext('gc') as () => void;
  const heapMb = () => {
    gc();
    return process.memoryUsage().heapUsed / MB;
  };

  for (const vault of REPORT ? vaults : []) {
    it(`measures a reopen of ${vault.shape}-${vault.files}`, { timeout: 900_000 }, async () => {
      const bridge = new RowsBridge(vault.indexDir);
      transport.invoke = (command, args) => bridge.invoke(command, args);
      try {
        const timed = async () => {
          const startedCpu = process.cpuUsage();
          const started = performance.now();
          const result = await buildLocalManifestWithEntries(dirHandle(vault.dir, 'vault', vault.dir));
          const ms = performance.now() - started;
          const cpu = process.cpuUsage(startedCpu);
          const held = heapMb();
          const settleStarted = performance.now();
          await vaultRowWritesSettled();
          return { result, ms, cpuMs: (cpu.user + cpu.system) / 1000, heapMb: held, writeMs: performance.now() - settleStarted };
        };

        vaultIndexPreference.write('off');
        let before: Awaited<ReturnType<typeof timed>> | null = await timed();
        const beforeFigures = { ms: before.ms, cpuMs: before.cpuMs, heapMb: before.heapMb, docs: before.result.build.manifest.docs.length };
        before = null;
        vaultIndexPreference.write('on');

        let cold: Awaited<ReturnType<typeof timed>> | null = await timed();
        const coldFigures = { ms: cold.ms, writeMs: cold.writeMs };
        cold = null;
        bridge.answers = [];

        const changed = join(vault.dir, 'wiki/page-7.md');
        appendFileSync(changed, '\n- one changed file\n');
        let after: Awaited<ReturnType<typeof timed>> | null = await timed();
        const afterFigures = {
          ms: after.ms,
          cpuMs: after.cpuMs,
          heapMb: after.heapMb,
          docs: after.result.build.manifest.docs.length,
          fromRows: 0,
        };
        after = null;
        afterFigures.fromRows = bridge.takeHits();

        const textBytes = markdownFiles(vault.dir).reduce((sum, file) => sum + statSync(join(vault.dir, file)).size, 0);
        const size = await bridge.size(vault.dir);
        const row = {
          files: vault.files,
          shape: vault.shape,
          load: loadavg()[0],
          before: beforeFigures,
          cold: coldFigures,
          after: afterFigures,
          textBytes,
          rowsBytes: size.rowsBytes,
          folderBytes: size.folderBytes,
        };
        appendFileSync(REPORT, `${JSON.stringify(row)}\n`);
        expect(afterFigures.docs).toBe(beforeFigures.docs);
        expect(afterFigures.fromRows).toBe(markdownFiles(vault.dir).length - 1);
      } finally {
        bridge.close();
      }
    });
  }
});
